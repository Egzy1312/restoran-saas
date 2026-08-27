'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/** Otpremanje slike sa uređaja (zamjena za ranije "zalijepi URL" polje) - odmah šalje fajl na server i puni `value` sa dobijenim URL-om. */
export default function ImageUploadField({
  label,
  value,
  onChange,
  upload,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  upload: (file: File) => Promise<{ url: string }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // dozvoljava ponovni odabir istog fajla kasnije
    if (!file) return;

    setUploading(true);
    try {
      const { url } = await upload(file);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Otpremanje slike nije uspjelo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary/50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground/50" />
          )}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Otpremanje…' : value ? 'Promijeni sliku' : 'Otpremi sliku'}
        </Button>
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-destructive">
            Ukloni
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  );
}
