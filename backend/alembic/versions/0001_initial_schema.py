"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-10-16 01:57:44.800043
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table('artists',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('bio', sa.Text(), nullable=True),
    sa.Column('image_url', sa.String(length=2048), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_artists'))
    )
    op.create_index('ix_artists_name_trgm', 'artists', ['name'], unique=False, postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.create_table('genres',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_genres')),
    sa.UniqueConstraint('name', name=op.f('uq_genres_name'))
    )
    op.create_table('users',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('username', sa.String(length=30), nullable=False),
    sa.Column('avatar_url', sa.String(length=2048), nullable=True),
    sa.Column('bio', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email')),
    sa.UniqueConstraint('username', name=op.f('uq_users_username'))
    )
    op.create_index('ix_users_username_trgm', 'users', ['username'], unique=False, postgresql_using='gin', postgresql_ops={'username': 'gin_trgm_ops'})
    op.create_table('albums',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('artist_id', sa.UUID(), nullable=False),
    sa.Column('cover_url', sa.String(length=2048), nullable=True),
    sa.Column('release_year', sa.SmallInteger(), nullable=True),
    sa.ForeignKeyConstraint(['artist_id'], ['artists.id'], name=op.f('fk_albums_artist_id_artists'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_albums'))
    )
    op.create_index('ix_albums_artist_id', 'albums', ['artist_id'], unique=False)
    op.create_index('ix_albums_title_trgm', 'albums', ['title'], unique=False, postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.create_table('friendships',
    sa.Column('follower_id', sa.UUID(), nullable=False),
    sa.Column('following_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'accepted', name='friendship_status'), server_default='accepted', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('follower_id <> following_id', name=op.f('ck_friendships_no_self_follow')),
    sa.ForeignKeyConstraint(['follower_id'], ['users.id'], name=op.f('fk_friendships_follower_id_users'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['following_id'], ['users.id'], name=op.f('fk_friendships_following_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('follower_id', 'following_id', name=op.f('pk_friendships'))
    )
    op.create_index('ix_friendships_following_id', 'friendships', ['following_id'], unique=False)
    op.create_table('playlists',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_public', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_playlists_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_playlists'))
    )
    op.create_index('ix_playlists_user_id', 'playlists', ['user_id'], unique=False)
    op.create_table('profile_likes',
    sa.Column('liker_id', sa.UUID(), nullable=False),
    sa.Column('liked_user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('liker_id <> liked_user_id', name=op.f('ck_profile_likes_no_self_like')),
    sa.ForeignKeyConstraint(['liked_user_id'], ['users.id'], name=op.f('fk_profile_likes_liked_user_id_users'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['liker_id'], ['users.id'], name=op.f('fk_profile_likes_liker_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('liker_id', 'liked_user_id', name=op.f('pk_profile_likes'))
    )
    op.create_index('ix_profile_likes_liked_user_id', 'profile_likes', ['liked_user_id'], unique=False)
    op.create_table('refresh_tokens',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_refresh_tokens_token_hash'))
    )
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('tracks',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('album_id', sa.UUID(), nullable=False),
    sa.Column('track_number', sa.SmallInteger(), server_default='1', nullable=False),
    sa.Column('duration_sec', sa.Integer(), nullable=False),
    sa.Column('audio_url', sa.String(length=2048), nullable=False),
    sa.Column('preview_start_sec', sa.Integer(), server_default='0', nullable=False),
    sa.CheckConstraint('duration_sec > 0', name=op.f('ck_tracks_duration_positive')),
    sa.CheckConstraint('preview_start_sec >= 0 AND preview_start_sec < duration_sec', name=op.f('ck_tracks_preview_start_in_range')),
    sa.ForeignKeyConstraint(['album_id'], ['albums.id'], name=op.f('fk_tracks_album_id_albums'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tracks'))
    )
    op.create_index('ix_tracks_album_id', 'tracks', ['album_id'], unique=False)
    op.create_index('ix_tracks_title_trgm', 'tracks', ['title'], unique=False, postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.create_table('favorite_tracks',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('track_id', sa.UUID(), nullable=False),
    sa.Column('saved_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], name=op.f('fk_favorite_tracks_track_id_tracks'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_favorite_tracks_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'track_id', name=op.f('pk_favorite_tracks'))
    )
    op.create_index('ix_favorite_tracks_user_saved', 'favorite_tracks', ['user_id', 'saved_at'], unique=False)
    op.create_table('listening_history',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('track_id', sa.UUID(), nullable=False),
    sa.Column('played_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], name=op.f('fk_listening_history_track_id_tracks'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_listening_history_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_listening_history'))
    )
    op.create_index('ix_listening_history_track_id', 'listening_history', ['track_id'], unique=False)
    op.create_index('ix_listening_history_user_played', 'listening_history', ['user_id', 'played_at'], unique=False)
    op.create_table('playlist_tracks',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('playlist_id', sa.UUID(), nullable=False),
    sa.Column('track_id', sa.UUID(), nullable=False),
    sa.Column('position', sa.SmallInteger(), nullable=False),
    sa.ForeignKeyConstraint(['playlist_id'], ['playlists.id'], name=op.f('fk_playlist_tracks_playlist_id_playlists'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], name=op.f('fk_playlist_tracks_track_id_tracks'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_playlist_tracks')),
    sa.UniqueConstraint('playlist_id', 'position', deferrable=True, initially='DEFERRED', name='uq_playlist_tracks_playlist_position')
    )
    op.create_index('ix_playlist_tracks_track_id', 'playlist_tracks', ['track_id'], unique=False)
    op.create_table('stories',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('track_id', sa.UUID(), nullable=False),
    sa.Column('caption', sa.String(length=280), nullable=True),
    sa.Column('background_color', sa.String(length=32), server_default='#1DB954,#0B3D2E', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('expires_at > created_at', name=op.f('ck_stories_expires_after_created')),
    sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], name=op.f('fk_stories_track_id_tracks'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_stories_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_stories'))
    )
    op.create_index('ix_stories_expires_at', 'stories', ['expires_at'], unique=False)
    op.create_index('ix_stories_track_id', 'stories', ['track_id'], unique=False)
    op.create_index('ix_stories_user_expires', 'stories', ['user_id', 'expires_at'], unique=False)
    op.create_table('track_genres',
    sa.Column('track_id', sa.UUID(), nullable=False),
    sa.Column('genre_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['genre_id'], ['genres.id'], name=op.f('fk_track_genres_genre_id_genres'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], name=op.f('fk_track_genres_track_id_tracks'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('track_id', 'genre_id', name=op.f('pk_track_genres'))
    )
    op.create_index('ix_track_genres_genre_id', 'track_genres', ['genre_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_track_genres_genre_id', table_name='track_genres')
    op.drop_table('track_genres')
    op.drop_index('ix_stories_user_expires', table_name='stories')
    op.drop_index('ix_stories_track_id', table_name='stories')
    op.drop_index('ix_stories_expires_at', table_name='stories')
    op.drop_table('stories')
    op.drop_index('ix_playlist_tracks_track_id', table_name='playlist_tracks')
    op.drop_table('playlist_tracks')
    op.drop_index('ix_listening_history_user_played', table_name='listening_history')
    op.drop_index('ix_listening_history_track_id', table_name='listening_history')
    op.drop_table('listening_history')
    op.drop_index('ix_favorite_tracks_user_saved', table_name='favorite_tracks')
    op.drop_table('favorite_tracks')
    op.drop_index('ix_tracks_title_trgm', table_name='tracks', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.drop_index('ix_tracks_album_id', table_name='tracks')
    op.drop_table('tracks')
    op.drop_index('ix_refresh_tokens_user_id', table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_index('ix_profile_likes_liked_user_id', table_name='profile_likes')
    op.drop_table('profile_likes')
    op.drop_index('ix_playlists_user_id', table_name='playlists')
    op.drop_table('playlists')
    op.drop_index('ix_friendships_following_id', table_name='friendships')
    op.drop_table('friendships')
    op.drop_index('ix_albums_title_trgm', table_name='albums', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.drop_index('ix_albums_artist_id', table_name='albums')
    op.drop_table('albums')
    op.drop_index('ix_users_username_trgm', table_name='users', postgresql_using='gin', postgresql_ops={'username': 'gin_trgm_ops'})
    op.drop_table('users')
    op.drop_table('genres')
    op.drop_index('ix_artists_name_trgm', table_name='artists', postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.drop_table('artists')
    op.execute("DROP TYPE IF EXISTS friendship_status")
