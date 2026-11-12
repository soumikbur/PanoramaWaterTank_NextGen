"""Add persistent trains and train_lookup_cache tables.

Revision ID: 002_add_trains_table
Revises: 001_initial_schema
Create Date: 2026-11-12 13:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '002_add_trains_table'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trains',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('train_number', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=False),
        sa.Column('source_station', sa.String(length=120), nullable=True),
        sa.Column('source_code', sa.String(length=16), nullable=True),
        sa.Column('destination_station', sa.String(length=120), nullable=True),
        sa.Column('destination_code', sa.String(length=16), nullable=True),
        sa.Column('region', sa.String(length=32), nullable=False, server_default='NORTH'),
        sa.Column('railway_zone', sa.String(length=16), nullable=True),
        sa.Column('train_type', sa.String(length=64), nullable=True, server_default='Express'),
        sa.Column('running_days_json', sa.Text(), nullable=True),
        sa.Column('coach_configuration_json', sa.Text(), nullable=True),
        sa.Column('route_json', sa.Text(), nullable=True),
        sa.Column('total_coaches', sa.Integer(), nullable=True),
        sa.Column('has_official_composition', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('api_provider', sa.String(length=64), nullable=True),
        sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('train_number')
    )
    op.create_index('ix_trains_train_number', 'trains', ['train_number'], unique=True)
    op.create_index('ix_trains_region', 'trains', ['region'], unique=False)

    op.create_table(
        'train_lookup_cache',
        sa.Column('train_number', sa.String(length=16), nullable=False),
        sa.Column('provider', sa.String(length=64), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('train_number')
    )


def downgrade() -> None:
    op.drop_table('train_lookup_cache')
    op.drop_index('ix_trains_region', table_name='trains')
    op.drop_index('ix_trains_train_number', table_name='trains')
    op.drop_table('trains')

