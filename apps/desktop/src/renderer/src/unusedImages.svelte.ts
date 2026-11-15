import type { Api } from '../../preload/api'

type UnusedApi = Pick<Api, 'unusedImages' | 'trashUnusedImages'>
export type UnusedImage = { name: string; size: number }

/** How long after the library changes the pictures are checked again. */
const CHECK_DELAY = 1500

/** Pictures in the library that no sheet mentions, and the clean-up dialog for them. */
export class UnusedImages {
  list = $state<UnusedImage[]>([])
  /** The pictures the clean-up dialog is offering, or null when it is closed. */
  cleaning = $state<UnusedImage[] | null>(null)
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly api: UnusedApi,
    private readonly host: { hasLibrary(): boolean; info(text: string): void }
  ) {}

  /** Looks for unused pictures, quietly, a moment after the library changes. */
  check = (): void => {
    clearTimeout(this.timer)
    this.timer = setTimeout(async () => {
      if (this.host.hasLibrary()) this.list = await this.api.unusedImages()
    }, CHECK_DELAY)
  }

  open = async (): Promise<void> => {
    this.list = await this.api.unusedImages()
    this.cleaning = this.list
  }

  close = (): void => {
    this.cleaning = null
  }

  /** Moves the named pictures to the trash and looks again. */
  clean = async (names: string[]): Promise<void> => {
    this.cleaning = null
    const count = await this.api.trashUnusedImages(names)
    this.list = await this.api.unusedImages()
    this.host.info(`Moved ${count} unused ${count === 1 ? 'image' : 'images'} to the trash`)
  }
}
