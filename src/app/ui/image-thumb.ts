import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { db } from '../core/db';

/** Shows an image stored in IndexedDB. */
@Component({
  selector: 'app-image-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (url()) {
      <img [src]="url()" alt="" />
    } @else {
      <ng-content />
    }`,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      overflow: hidden;
      border-radius: 10px;
      background: var(--surface-2);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class ImageThumb {
  readonly imageId = input<number | null | undefined>(null);
  protected readonly url = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const id = this.imageId();
      let objectUrl: string | null = null;
      let cancelled = false;
      if (id) {
        db.images.get(id).then((img) => {
          if (cancelled || !img) return;
          objectUrl = URL.createObjectURL(img.blob);
          this.url.set(objectUrl);
        });
      }
      onCleanup(() => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        this.url.set(null);
      });
    });
  }
}
