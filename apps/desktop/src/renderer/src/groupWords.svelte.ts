import type { Api } from '../../preload/api'

const DELAY = 300

/** The word count of the selected group, recounted shortly after something changes. */
export class GroupWords {
  /** The latest total, or null before the first count. */
  total = $state<number | null>(null)
  private latest = 0

  constructor(private readonly api: Pick<Api, 'groupWords'>) {}

  /** Counts `path` after a short pause; the returned function cancels it. A later count replaces an earlier one. */
  schedule = (path: string): (() => void) => {
    const id = ++this.latest
    const timer = setTimeout(() => {
      this.api
        .groupWords(path)
        .then((total) => {
          if (id === this.latest) this.total = total
        })
        .catch(() => {})
    }, DELAY)
    return () => clearTimeout(timer)
  }
}
