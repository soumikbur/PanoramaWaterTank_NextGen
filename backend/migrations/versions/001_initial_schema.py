"""Initial database schema migration.

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-28 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('username', sa.String(length=64), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=128), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=32), nullable=False, server_default='OPERATOR'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email')
    )

    # Devices table
    op.create_table(
        'devices',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('uid', sa.String(length=64), nullable=False),
        sa.Column('train_number', sa.String(length=32), nullable=False, server_default='12002'),
        sa.Column('coach_number', sa.String(length=32), nullable=False, server_default='B4'),
        sa.Column('name', sa.String(length=128), nullable=False, server_default='Coach Water Monitor'),
        sa.Column('hardware_version', sa.String(length=32), nullable=True),
        sa.Column('firmware_version', sa.String(length=32), nullable=True),
        sa.Column('is_online', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uid')
    )

    # Tanks table
    op.create_table(
        'tanks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('device_id', sa.String(length=36), nullable=False),
        sa.Column('tank_index', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('name', sa.String(length=64), nullable=False, server_default='Primary Water Tank'),
        sa.Column('tank_type', sa.String(length=32), nullable=False, server_default='CYLINDRICAL'),
        sa.Column('capacity_liters', sa.Float(), nullable=False, server_default='20.0'),
        sa.Column('height_cm', sa.Float(), nullable=False, server_default='50.0'),
        sa.Column('area_m2', sa.Float(), nullable=False, server_default='0.04'),
        sa.Column('warning_threshold_percent', sa.Float(), nullable=False, server_default='20.0'),
        sa.Column('critical_threshold_percent', sa.Float(), nullable=False, server_default='10.0'),
        sa.Column('overflow_threshold_percent', sa.Float(), nullable=False, server_default='100.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('device_id', 'tank_index', name='uq_device_tank_index')
    )

    # Telemetry Readings table
    op.create_table(
        'telemetry_readings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('device_id', sa.String(length=36), nullable=False),
        sa.Column('tank_id', sa.String(length=36), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('raw_level_percent', sa.Float(), nullable=False),
        sa.Column('level_percent', sa.Float(), nullable=False),
        sa.Column('volume_liters', sa.Float(), nullable=False),
        sa.Column('height_cm', sa.Float(), nullable=False),
        sa.Column('sensor_valid', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('altitude', sa.Float(), nullable=True),
        sa.Column('speed_kmh', sa.Float(), nullable=True),
        sa.Column('satellites', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('battery_v1', sa.Float(), nullable=True),
        sa.Column('auxiliary_v2', sa.Float(), nullable=True),
        sa.Column('raw_payload', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tank_id'], ['tanks.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Alarms table
    op.create_table(
        'alarms',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('device_id', sa.String(length=36), nullable=False),
        sa.Column('tank_id', sa.String(length=36), nullable=True),
        sa.Column('alarm_type', sa.String(length=32), nullable=False),
        sa.Column('severity', sa.String(length=16), nullable=False),
        sa.Column('trigger_value', sa.Float(), nullable=False),
        sa.Column('threshold_value', sa.Float(), nullable=False),
        sa.Column('message', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='ACTIVE'),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged_by', sa.String(length=36), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tank_id'], ['tanks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['acknowledged_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Alarm History table
    op.create_table(
        'alarm_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('alarm_id', sa.String(length=36), nullable=False),
        sa.Column('previous_status', sa.String(length=16), nullable=False),
        sa.Column('new_status', sa.String(length=16), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('changed_by', sa.String(length=36), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['alarm_id'], ['alarms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Settings table
    op.create_table(
        'settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('key')
    )

    # Audit Events table
    op.create_table(
        'audit_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('action', sa.String(length=64), nullable=False),
        sa.Column('target_type', sa.String(length=64), nullable=False),
        sa.Column('target_id', sa.String(length=64), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('audit_events')
    op.drop_table('settings')
    op.drop_table('alarm_history')
    op.drop_table('alarms')
    op.drop_table('telemetry_readings')
    op.drop_table('tanks')
    op.drop_table('devices')
    op.drop_table('users')

