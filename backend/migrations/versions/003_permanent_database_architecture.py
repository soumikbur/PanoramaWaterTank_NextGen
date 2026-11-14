"""Permanent database architecture: railway hierarchy, coaches, deletion audit, and sync outbox.

Revision ID: 003_permanent_database_architecture
Revises: 002_add_trains_table
Create Date: 2026-11-14 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '003_permanent_database_architecture'
down_revision: Union[str, None] = '002_add_trains_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Railway Regions table
    op.create_table(
        'railway_regions',
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('headquarters', sa.String(length=64), nullable=True),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('code')
    )

    # 2. Railway Zones table
    op.create_table(
        'railway_zones',
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('region_code', sa.String(length=16), nullable=False),
        sa.Column('headquarters', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['region_code'], ['railway_regions.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('code')
    )
    op.create_index('ix_railway_zones_region_code', 'railway_zones', ['region_code'])

    # 3. Coaches table
    op.create_table(
        'coaches',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('train_id', sa.String(length=36), nullable=False),
        sa.Column('train_number', sa.String(length=16), nullable=False),
        sa.Column('coach_number', sa.String(length=16), nullable=False),
        sa.Column('coach_name', sa.String(length=64), nullable=True),
        sa.Column('coach_category', sa.String(length=64), nullable=False, server_default='PASSENGER'),
        sa.Column('coach_type', sa.String(length=32), nullable=True, server_default='AC_CHAIR_CAR'),
        sa.Column('position', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('device_uid', sa.String(length=64), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['train_id'], ['trains.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('train_number', 'coach_number', 'is_deleted', name='uq_train_coach_active')
    )
    op.create_index('ix_coaches_train_id', 'coaches', ['train_id'])
    op.create_index('ix_coaches_train_number', 'coaches', ['train_number'])
    op.create_index('ix_coaches_coach_number', 'coaches', ['coach_number'])
    op.create_index('ix_coaches_device_uid', 'coaches', ['device_uid'])

    # 4. Deletion Audit Records table
    op.create_table(
        'deletion_audit_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('admin_username', sa.String(length=64), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_identifier', sa.String(length=64), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=True),
        sa.Column('snapshot_json', sa.Text(), nullable=False),
        sa.Column('reason', sa.String(length=255), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_deletion_audit_entity_type', 'deletion_audit_records', ['entity_type'])
    op.create_index('ix_deletion_audit_entity_identifier', 'deletion_audit_records', ['entity_identifier'])

    # 5. Transactional Sync Outbox table
    op.create_table(
        'sync_outbox',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('event_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=64), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=False),
        sa.Column('operation', sa.String(length=32), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='PENDING'),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sync_outbox_status', 'sync_outbox', ['status'])
    op.create_index('ix_sync_outbox_event_id', 'sync_outbox', ['event_id'])

    # 6. Alter existing tables (safe column additions)
    # Trains
    try:
        op.add_column('trains', sa.Column('region_id', sa.String(length=16), nullable=True))
        op.add_column('trains', sa.Column('zone_id', sa.String(length=16), nullable=True))
        op.add_column('trains', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()))
    except Exception:
        pass

    # Devices
    try:
        op.add_column('devices', sa.Column('train_id', sa.String(length=36), nullable=True))
        op.add_column('devices', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()))
    except Exception:
        pass

    # Tanks
    try:
        op.add_column('tanks', sa.Column('coach_id', sa.String(length=36), nullable=True))
        op.add_column('tanks', sa.Column('train_number', sa.String(length=32), nullable=True))
        op.add_column('tanks', sa.Column('coach_number', sa.String(length=32), nullable=True))
        op.add_column('tanks', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()))
    except Exception:
        pass

    # Telemetry
    try:
        op.add_column('telemetry_readings', sa.Column('device_uid', sa.String(length=64), nullable=True))
        op.add_column('telemetry_readings', sa.Column('train_number', sa.String(length=32), nullable=True))
        op.add_column('telemetry_readings', sa.Column('coach_number', sa.String(length=32), nullable=True))
        op.add_column('telemetry_readings', sa.Column('tank_index', sa.Integer(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    op.drop_table('sync_outbox')
    op.drop_table('deletion_audit_records')
    op.drop_table('coaches')
    op.drop_table('railway_zones')
    op.drop_table('railway_regions')
