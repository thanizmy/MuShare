import { AudioWaveform, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { CoverImage } from '../components/media/CoverImage'
import { PlayPieceButton } from '../components/studio/PlayPieceButton'
import { StatusChip } from '../components/studio/StatusChip'
import { UploadDialog } from '../components/studio/UploadDialog'
import { UsageMeter } from '../components/studio/UsageMeter'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePieces, useStudioUsage } from '../hooks/useStudio'
import { formatBytes, formatTime } from '../lib/format'
import type { Piece } from '../types/studio'

function PieceRow({ piece }: { piece: Piece }) {
  return (
    <li className="flex items-center gap-4 rounded-card bg-surface p-3 transition hover:bg-elevated">
      <PlayPieceButton piece={piece} />
      <Link to={`/studio/${piece.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <CoverImage src={piece.cover_url} className="h-14 w-14 shrink-0 rounded-control" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{piece.title}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {formatTime(piece.duration_sec)} · {formatBytes(piece.audio_bytes)}
          </span>
        </span>
      </Link>
      <StatusChip status={piece.status} />
    </li>
  )
}

export default function StudioPage() {
  useDocumentTitle('My Studio')
  const pieces = usePieces()
  const usage = useStudioUsage()
  const [uploading, setUploading] = useState(false)
  const full = usage.data ? usage.data.pieces_used >= usage.data.pieces_limit : false

  const uploadButton = (
    <button
      type="button"
      className="btn-primary"
      disabled={full}
      title={full ? 'Your studio is full. Delete a piece to upload another.' : undefined}
      onClick={() => setUploading(true)}
    >
      <Upload className="h-4 w-4" aria-hidden />
      Upload
    </button>
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My Studio</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Your own music. Everything here is private until you decide to publish it or share it
            to your story.
          </p>
        </div>
        {uploadButton}
      </div>

      {usage.data && <UsageMeter usage={usage.data} />}
      {full && (
        <p role="status" className="text-sm text-danger">
          Your studio is full. Delete a piece to upload another.
        </p>
      )}

      <section aria-label="Your pieces">
        <QueryBoundary
          query={pieces}
          skeleton={<RowSkeletons count={3} />}
          empty={{
            when: (items) => items.length === 0,
            node: (
              <EmptyState
                icon={AudioWaveform}
                title="Nothing here yet"
                description="Upload a track you made. It stays private until you say otherwise."
                action={uploadButton}
              />
            ),
          }}
        >
          {(items) => (
            <ul aria-label="Pieces" className="space-y-2">
              {items.map((piece) => (
                <PieceRow key={piece.id} piece={piece} />
              ))}
            </ul>
          )}
        </QueryBoundary>
      </section>

      <UploadDialog open={uploading} onClose={() => setUploading(false)} />
    </div>
  )
}
