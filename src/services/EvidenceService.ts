import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  copyAsync,
  readDirectoryAsync,
  deleteAsync,
} from 'expo-file-system/legacy';

// expo-file-system v56 moved all procedural APIs to the /legacy subpath.
// The main 'expo-file-system' export only contains the new OOP API (File, Directory, Paths).

function getEvidenceDir(): string {
  const base = documentDirectory ?? cacheDirectory ?? '';
  return base + 'evidence/';
}

class EvidenceService {

  // ── Photo Capture ────────────────────────────────────────────────────────
  async capturePhoto(cameraRef: any): Promise<string | null> {
    try {
      if (!cameraRef?.current) return null;
      const photo = await cameraRef.current.takePictureAsync({
        quality:        0.8,
        base64:         false,
        exif:           false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        const dir = getEvidenceDir();
        const dirInfo = await getInfoAsync(dir);
        if (!dirInfo.exists) {
          await makeDirectoryAsync(dir, { intermediates: true });
        }
        const fileName = `photo_${Date.now()}.jpg`;
        const destPath = dir + fileName;
        await copyAsync({ from: photo.uri, to: destPath });
        console.log('[SHIELD] ✅ Photo evidence saved:', fileName);
        return destPath;
      }
    } catch (e) {
      console.warn('[SHIELD] Photo capture error:', e);
    }
    return null;
  }

  // ── Evidence List ────────────────────────────────────────────────────────
  async getEvidenceFiles(): Promise<EvidenceFile[]> {
    try {
      const dir = getEvidenceDir();
      const dirInfo = await getInfoAsync(dir);
      if (!dirInfo.exists) return [];

      const names = await readDirectoryAsync(dir);
      if (names.length === 0) return [];

      const files = await Promise.all(
        names.map(async (name: string) => {
          const filePath = dir + name;
          // In the legacy API, FileInfo includes size and modificationTime
          // when exists === true. No options needed.
          const fi = await getInfoAsync(filePath);
          const ext = name.split('.').pop()?.toLowerCase() ?? '';
          const type: EvidenceFile['type'] =
            ['m4a', 'mp4', '3gp', 'aac', 'wav'].includes(ext) ? 'Audio' :
            ['jpg', 'jpeg', 'png'].includes(ext)               ? 'Photo' : 'File';

          const bytes       = fi.exists ? (fi.size ?? 0) : 0;
          const modTime     = fi.exists ? (fi.modificationTime ?? 0) : 0;

          const size =
            bytes < 1024    ? `${bytes} B` :
            bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` :
                              `${(bytes / 1048576).toFixed(1)} MB`;

          return {
            name, type, size,
            path: filePath,
            mod:  modTime,
            date: modTime
              ? new Date(modTime * 1000).toLocaleString('en-IN')
              : 'Unknown date',
          };
        })
      );

      return files.sort((a: EvidenceFile, b: EvidenceFile) => b.mod - a.mod);
    } catch (e) {
      console.warn('[SHIELD] getEvidenceFiles error:', e);
      return [];
    }
  }

  // ── Delete a single file ─────────────────────────────────────────────────
  async deleteFile(path: string): Promise<void> {
    await deleteAsync(path, { idempotent: true });
  }

  // ── Delete all evidence ──────────────────────────────────────────────────
  async deleteAll(): Promise<void> {
    const dir = getEvidenceDir();
    await deleteAsync(dir, { idempotent: true });
  }
}

export interface EvidenceFile {
  name: string;
  type: 'Audio' | 'Photo' | 'File';
  size: string;
  date: string;
  path: string;
  mod:  number;
}

export const evidenceService = new EvidenceService();