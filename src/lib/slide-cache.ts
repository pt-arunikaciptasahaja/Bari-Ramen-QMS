// Keep public marketing images in this TV session only, never credentials.
export type CachedSlide = { version: string; etag: string; blob: Blob };
export class SlideCache {
  private entries = new Map<string, CachedSlide>();
  private bytes = 0;
  constructor(private maxBytes = 32 * 1024 * 1024) {}
  get(id: string) { return this.entries.get(id); }
  set(id: string, entry: CachedSlide) {
    this.delete(id);
    if (entry.blob.size > this.maxBytes) return;
    this.entries.set(id, entry); this.bytes += entry.blob.size;
    while (this.bytes > this.maxBytes) this.delete(this.entries.keys().next().value!);
  }
  private delete(id: string) {
    const previous = this.entries.get(id);
    if (previous) this.bytes -= previous.blob.size;
    this.entries.delete(id);
  }
  retain(ids: Set<string>) { for (const id of this.entries.keys()) if (!ids.has(id)) this.delete(id); }
  clear() { this.entries.clear(); this.bytes = 0; }
}
