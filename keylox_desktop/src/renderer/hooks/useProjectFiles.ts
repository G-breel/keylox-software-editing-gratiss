import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { keylox, MissingMedia, RecentProjectsResult } from '../lib/ipc';
import { remainingMissing, toProjectSnapshot } from '../lib/projectState';
import { toastError, toastInfo, toastSuccess } from '../lib/toast';

/**
 * Simpan/buka proyek `.keylox` (M2-A / U8).
 *
 * - Save/Open lewat IPC MAIN (dialog native + validasi path di sana).
 * - Autosave: setiap perubahan proyek menandai dirty + snapshot ke MAIN;
 *   MAIN menulis `userData/autosave.keylox` tiap 60 detik.
 * - Relink: pilih berkas pengganti per media yang hilang.
 */
export interface ProjectFilesApi {
  filePath: string | null;
  dirty: boolean;
  busy: boolean;
  missing: MissingMedia[];
  recent: RecentProjectsResult;
  save: (saveAs?: boolean) => Promise<void>;
  open: () => Promise<void>;
  openRecent: (filePath: string) => Promise<void>;
  recoverAutosave: () => Promise<void>;
  relink: () => Promise<void>;
  discardAutosave: () => Promise<void>;
  newProject: () => void;
}

function projectChanged(prev: any, next: any): boolean {
  if (!prev) return false;
  return prev.name !== next.name
    || prev.aspectRatio !== next.aspectRatio
    || prev.width !== next.width
    || prev.height !== next.height
    || prev.fps !== next.fps
    || prev.tracks !== next.tracks
    || prev.media !== next.media
    || prev.lastExport !== next.lastExport;
}

export function useProjectFiles(): ProjectFilesApi {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<MissingMedia[]>([]);
  const [recent, setRecent] = useState<RecentProjectsResult>({ items: [], autosave: null });
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      const result = await keylox.project.recent();
      setRecent(result);
    } catch {
      /* recent bersifat informatif */
    }
  }, []);

  const pushDirty = useCallback(async () => {
    try {
      await keylox.project.markDirty({
        dirty: true,
        project: toProjectSnapshot(useEditorStore.getState()),
      });
    } catch {
      /* autosave best-effort */
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  // Tandai dirty + kirim snapshot (debounce 1,5 dtk) setiap perubahan proyek.
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((next, prev) => {
      if (suppressRef.current) return;
      if (!projectChanged(prev, next)) return;
      setDirty(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void pushDirty(); }, 1500);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pushDirty]);

  const save = useCallback(async (saveAs = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await keylox.project.save({
        project: toProjectSnapshot(useEditorStore.getState()),
        ...(saveAs ? { saveAs: true } : (filePath ? { filePath } : {})),
      });
      if (result.canceled || !result.ok) return;
      setFilePath(result.filePath || filePath);
      setDirty(false);
      await keylox.project.markDirty({ dirty: false });
      await refreshRecent();
      toastSuccess(`Proyek disimpan: ${result.filePath?.split(/[\\/]/).pop() || 'proyek.keylox'}`);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }, [busy, filePath, refreshRecent]);

  const applyOpen = useCallback(async (result: any, keepDirty = false) => {
    if (!result || !result.ok || !result.project) return;
    suppressRef.current = true;
    useEditorStore.getState().loadProject(result.project);
    setFilePath(result.autosave ? null : (result.filePath || null));
    setMissing(Array.isArray(result.missingMedia) ? result.missingMedia : []);
    setDirty(keepDirty);
    if (keepDirty) void pushDirty();
    await refreshRecent();
    // Lepas penekanan setelah perubahan loadProject diproses subscriber.
    setTimeout(() => { suppressRef.current = false; }, 0);
  }, [pushDirty, refreshRecent]);

  const open = useCallback(async () => {
    if (busy) return;
    if (dirty && !window.confirm('Proyek belum disimpan. Buka proyek lain dan buang perubahan?')) return;
    setBusy(true);
    try {
      const result = await keylox.project.open({});
      await applyOpen(result);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }, [applyOpen, busy, dirty]);

  const openRecent = useCallback(async (path: string) => {
    if (busy) return;
    if (dirty && !window.confirm('Proyek belum disimpan. Buka proyek lain dan buang perubahan?')) return;
    setBusy(true);
    try {
      const result = await keylox.project.open({ filePath: path });
      await applyOpen(result);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }, [applyOpen, busy, dirty]);

  const recoverAutosave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await keylox.project.open({ autosave: true });
      await applyOpen(result, true);
      toastInfo('Autosave dipulihkan. Simpan proyek untuk menyimpan permanen.');
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }, [applyOpen, busy]);

  const discardAutosave = useCallback(async () => {
    await keylox.project.markDirty({ dirty: false, discardAutosave: true });
    setRecent((r) => ({ ...r, autosave: null }));
  }, []);

  const relink = useCallback(async () => {
    if (missing.length === 0) {
      toastInfo('Tidak ada media yang perlu di-relink.');
      return;
    }
    const mapping: Record<string, string> = {};
    const queue = [...missing];
    for (const item of queue) {
      try {
        const paths = await keylox.dialog.openFiles();
        if (!paths || paths.length === 0) break;
        mapping[item.id] = paths[0];
      } catch (error) {
        toastError(error);
        break;
      }
    }
    if (Object.keys(mapping).length === 0) return;

    const state = useEditorStore.getState();
    state.relinkMedia(mapping);
    setMissing(remainingMissing(missing, mapping));
    setDirty(true);
    void pushDirty();
    toastSuccess(`${Object.keys(mapping).length} media di-relink. Simpan proyek untuk memperbarui manifest.`);
  }, [missing, pushDirty]);

  const newProject = useCallback(() => {
    suppressRef.current = false;
    useEditorStore.getState().initProject('Untitled');
    setFilePath(null);
    setDirty(false);
    setMissing([]);
    setRecent((r) => ({ ...r, autosave: null }));
    // Proyek baru membuang perubahan; autosave lama tidak boleh ditawarkan lagi.
    void keylox.project.markDirty({ dirty: false, discardAutosave: true });
  }, []);

  return {
    filePath,
    dirty,
    busy,
    missing,
    recent,
    save,
    open,
    openRecent,
    recoverAutosave,
    relink,
    discardAutosave,
    newProject,
  };
}
