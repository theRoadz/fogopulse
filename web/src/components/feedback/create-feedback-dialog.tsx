'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WalletButton } from '@/components/wallet'
import { useCreateFeedback } from '@/hooks/use-create-feedback'
import type { IssueCategory } from '@/types/feedback'

const CATEGORIES: { value: IssueCategory; label: string }[] = [
  { value: 'feedback', label: 'Feedback' },
  { value: 'bug', label: 'Bug' },
  { value: 'critical', label: 'Critical' },
  { value: 'feature-request', label: 'Feature Request' },
]

export function CreateFeedbackDialog() {
  const { connected } = useWallet()
  const { mutate: createFeedback, isPending } = useCreateFeedback()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<IssueCategory>('feedback')
  const [description, setDescription] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return

    createFeedback(
      { title: title.trim(), category, description: description.trim() },
      {
        onSuccess: () => {
          setOpen(false)
          setTitle('')
          setCategory('feedback')
          setDescription('')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          New Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
        </DialogHeader>

        {!connected ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to submit feedback
            </p>
            <WalletButton />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Brief description of the issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <Button
                    key={cat.value}
                    type="button"
                    size="sm"
                    variant={category === cat.value ? 'default' : 'outline'}
                    onClick={() => setCategory(cat.value)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Provide details about the issue..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={5}
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !title.trim() || !description.trim()}>
                {isPending ? 'Signing & Submitting...' : 'Submit'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
