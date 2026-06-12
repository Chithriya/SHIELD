// src/screens/EvidenceScreen.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, Alert, Image, Modal,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
// expo-file-system v56: all procedural APIs (documentDirectory, getInfoAsync, etc.)
// live in the /legacy subpath. The main package only exports the new OOP API.
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
  deleteAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useAudioPlayer } from 'expo-audio';
import { Colors } from '../constants/colors';

const { width: SW, height: SH } = Dimensions.get('window');

interface EvidenceFile {
  name: string;
  type: 'Audio' | 'Photo' | 'File';
  size: string;
  date: string;
  path: string;
  mod:  number;
}

function getEvidenceDir(): string {
  return (documentDirectory ?? '') + 'evidence/';
}

export default function EvidenceScreen() {
  const [files,        setFiles]       = useState<EvidenceFile[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [photoModal,   setPhotoModal]  = useState<string | null>(null);
  const [playingFile,  setPlayingFile] = useState<string | null>(null);
  const [busyFile,     setBusyFile]    = useState<string | null>(null);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const isMountedRef = useRef(true);

  const player = useAudioPlayer(null);
  const playerRef = useRef(player);
  useEffect(() => { playerRef.current = player; }, [player]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      try { playerRef.current.pause(); } catch {}
      try { playerRef.current.remove(); } catch {}
    };
  }, []);

  useFocusEffect(useCallback(() => {
    loadFiles();
    return () => {
      try {
        if (playerRef.current) {
          playerRef.current.pause();
        }
      } catch {}
      if (isMountedRef.current) setPlayingFile(null);
    };
  }, []));

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadFiles = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const dir  = getEvidenceDir();
      const info = await getInfoAsync(dir);
      if (!info.exists) {
        if (isMountedRef.current) { setFiles([]); setLoading(false); }
        return;
      }

      const names = await readDirectoryAsync(dir);
      const items: EvidenceFile[] = [];

      for (const name of names) {
        const path = dir + name;
        try {
          // Legacy FileInfo: when exists===true it includes size & modificationTime
          const fi  = await getInfoAsync(path);
          const ext = name.split('.').pop()?.toLowerCase() ?? '';
          const type: EvidenceFile['type'] =
            ['m4a','mp4','3gp','aac','wav'].includes(ext) ? 'Audio' :
            ['jpg','jpeg','png'].includes(ext)            ? 'Photo' : 'File';

          const bytes = fi.exists ? (fi.size ?? 0) : 0;
          const mod   = fi.exists ? (fi.modificationTime ?? 0) : 0;

          const size  = bytes < 1024      ? `${bytes} B`
                      : bytes < 1048576   ? `${Math.round(bytes / 1024)} KB`
                      :                    `${(bytes / 1048576).toFixed(1)} MB`;

          items.push({
            name, type, size, path, mod,
            date: mod ? new Date(mod * 1000).toLocaleString('en-IN') : '—',
          });
        } catch {}
      }

      items.sort((a, b) => b.mod - a.mod);
      if (isMountedRef.current) setFiles(items);
    } catch (e) {
      console.warn('[SHIELD] loadFiles error:', e);
      if (isMountedRef.current) setFiles([]);
    }
    if (isMountedRef.current) setLoading(false);
  };

  // ── Audio playback ─────────────────────────────────────────────────────────
  const stopAudio = async () => {
    try { player.pause(); } catch {}
    if (isMountedRef.current) setPlayingFile(null);
  };

  const playAudio = async (path: string) => {
    if (playingFile === path) { await stopAudio(); return; }
    if (!isMountedRef.current) return;
    setBusyFile(path);
    try {
      player.replace({ uri: path });
      player.play();
      if (isMountedRef.current) setPlayingFile(path);
    } catch {
      Alert.alert('Playback Error', 'Could not play this file.');
    }
    if (isMountedRef.current) setBusyFile(null);
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const shareFile = async (file: EvidenceFile) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'This device does not support file sharing.');
        return;
      }
      if (isMountedRef.current) setBusyFile(file.path);
      const mimeType =
        file.type === 'Audio' ? 'audio/m4a' :
        file.type === 'Photo' ? 'image/jpeg' : '*/*';

      await Sharing.shareAsync(file.path, {
        mimeType,
        dialogTitle: `Share evidence — ${file.name}`,
      });
    } catch {
      Alert.alert('Share failed', 'Could not share this file. Please try again.');
    } finally {
      if (isMountedRef.current) setBusyFile(null);
    }
  };

  const shareAll = () => {
    if (files.length === 0) return;
    Alert.alert(
      '📤 Share All Evidence',
      `Share all ${files.length} files with authorities or trusted contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share All',
          onPress: async () => {
            for (const file of files) {
              try {
                await Sharing.shareAsync(file.path, {
                  mimeType:    file.type === 'Audio' ? 'audio/m4a' : 'image/jpeg',
                  dialogTitle: `Evidence: ${file.name}`,
                });
                await new Promise(r => setTimeout(r, 600));
              } catch {}
            }
          },
        },
      ]
    );
  };

  // ── Save photo to gallery ─────────────────────────────────────────────────
  const saveToGallery = async (file: EvidenceFile) => {
    if (file.type !== 'Photo') return;
    try {
      let perm = mediaPermission;
      if (!perm?.granted) perm = await requestMediaPermission();
      if (!perm?.granted) {
        Alert.alert('Permission required', 'Allow media library access to save photos.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(file.path);
      Alert.alert('Saved ✅', 'Photo saved to your gallery.');
    } catch {
      Alert.alert('Save failed', 'Could not save photo to gallery.');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteFile = (file: EvidenceFile) => {
    Alert.alert(
      'Delete Evidence?',
      `"${file.name}"\n\nThis cannot be undone. Share it first if needed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            if (playingFile === file.path) await stopAudio();
            await deleteAsync(file.path, { idempotent: true });
            loadFiles();
          },
        },
      ]
    );
  };

  const deleteAll = () => {
    if (files.length === 0) return;
    Alert.alert(
      'Delete All?',
      `Delete all ${files.length} evidence files? Make sure you have shared them first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive',
          onPress: async () => {
            await stopAudio();
            for (const f of files) {
              await deleteAsync(f.path, { idempotent: true }).catch(() => {});
            }
            loadFiles();
          },
        },
      ]
    );
  };

  const typeColor = (t: string) =>
    t === 'Audio' ? Colors.shieldPurple :
    t === 'Photo' ? Colors.safeGreen   : Colors.textSecondary;

  if (loading) {
    return (
      <View style={[S.container, S.center]}>
        <ActivityIndicator color={Colors.shieldPurple} size="large" />
        <Text style={S.loadingTxt}>Loading evidence...</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>

      <Modal
        visible={!!photoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModal(null)}>
        <View style={S.modalBg}>
          <TouchableOpacity style={S.modalCloseBtn} onPress={() => setPhotoModal(null)}>
            <Text style={S.modalCloseTxt}>✕ Close</Text>
          </TouchableOpacity>
          {photoModal && (
            <>
              <Image source={{ uri: photoModal }} style={S.fullImg} resizeMode="contain" />
              <View style={S.modalActions}>
                <TouchableOpacity
                  style={S.modalShareBtn}
                  onPress={() => {
                    const f = files.find(x => x.path === photoModal);
                    if (f) { setPhotoModal(null); setTimeout(() => shareFile(f), 300); }
                  }}>
                  <Text style={S.modalShareTxt}>📤 Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={S.modalSaveBtn}
                  onPress={() => {
                    const f = files.find(x => x.path === photoModal);
                    if (f) saveToGallery(f);
                  }}>
                  <Text style={S.modalSaveTxt}>💾 Save to Gallery</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      <FlatList
        data={files}
        keyExtractor={i => i.name}
        contentContainerStyle={S.list}
        ListHeaderComponent={
          files.length > 0 ? (
            <View>
              <View style={S.summary}>
                <View>
                  <Text style={S.summaryTitle}>
                    {files.length} evidence file{files.length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={S.summarySub}>
                    {files.filter(f => f.type === 'Audio').length} audio  ·  {files.filter(f => f.type === 'Photo').length} photos
                  </Text>
                </View>
              </View>

              <View style={S.bulkRow}>
                <TouchableOpacity style={S.bulkShare} onPress={shareAll}>
                  <Text style={S.bulkShareTxt}>📤  Share All Evidence</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.bulkDelete} onPress={deleteAll}>
                  <Text style={S.bulkDeleteTxt}>🗑</Text>
                </TouchableOpacity>
              </View>

              <View style={S.tip}>
                <Text style={S.tipTxt}>
                  💡 Use Share to send evidence to police, family, or cloud storage.
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyIcon}>🗂️</Text>
            <Text style={S.emptyTitle}>No evidence yet</Text>
            <Text style={S.emptySub}>
              Photos and audio are captured automatically{'\n'}
              when SOS is triggered.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={S.card}>

            <View style={S.media}>
              {item.type === 'Photo' ? (
                <TouchableOpacity onPress={() => setPhotoModal(item.path)}>
                  <Image source={{ uri: item.path }} style={S.thumb} resizeMode="cover" />
                  <View style={S.thumbOverlay}>
                    <Text style={S.thumbLabel}>👁 View</Text>
                  </View>
                </TouchableOpacity>
              ) : item.type === 'Audio' ? (
                <TouchableOpacity
                  style={[S.audioBtn, playingFile === item.path && S.audioBtnPlaying]}
                  onPress={() => playAudio(item.path)}
                  disabled={busyFile === item.path}>
                  {busyFile === item.path
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={S.audioBtnTxt}>{playingFile === item.path ? '⏹' : '▶'}</Text>
                  }
                </TouchableOpacity>
              ) : (
                <Text style={S.fileEmoji}>📄</Text>
              )}
            </View>

            <View style={S.info}>
              <Text style={S.fileName} numberOfLines={1}>{item.name}</Text>
              <Text style={[S.fileType, { color: typeColor(item.type) }]}>
                {item.type} · {item.size}
              </Text>
              <Text style={S.fileDate}>{item.date}</Text>
              {item.type === 'Audio' && playingFile === item.path && (
                <Text style={S.playing}>🔊 Playing...</Text>
              )}
            </View>

            <View style={S.actions}>
              <TouchableOpacity
                style={S.actionBtn}
                onPress={() => shareFile(item)}
                disabled={busyFile === item.path}>
                {busyFile === item.path
                  ? <ActivityIndicator size="small" color={Colors.shieldPurple} />
                  : <Text style={S.iconShare}>📤</Text>
                }
              </TouchableOpacity>

              {item.type === 'Photo' && (
                <TouchableOpacity style={S.actionBtn} onPress={() => saveToGallery(item)}>
                  <Text style={S.iconSave}>💾</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={S.actionBtn} onPress={() => deleteFile(item)}>
                <Text style={S.iconDelete}>🗑</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}
      />
    </View>
  );
}

const S = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.background },
  center:          { justifyContent: 'center', alignItems: 'center' },
  list:            { padding: 16, paddingBottom: 40 },
  loadingTxt:      { color: Colors.textSecondary, marginTop: 10 },
  summary:         { marginBottom: 10 },
  summaryTitle:    { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary },
  summarySub:      { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  bulkRow:         { flexDirection: 'row', gap: 8, marginBottom: 10 },
  bulkShare:       { flex: 1, backgroundColor: Colors.shieldPurple, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  bulkShareTxt:    { color: Colors.white, fontWeight: '700', fontSize: 13 },
  bulkDelete:      { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.sosRed, alignItems: 'center' },
  bulkDeleteTxt:   { color: Colors.sosRed, fontSize: 16 },
  tip:             { backgroundColor: Colors.shieldPurpleLight, borderRadius: 8, padding: 10, marginBottom: 14 },
  tipTxt:          { fontSize: 12, color: Colors.shieldPurpleDark, lineHeight: 18 },
  card:            { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 10 },
  media:           { width: 64 },
  thumb:           { width: 64, height: 64, borderRadius: 8, backgroundColor: Colors.border },
  thumbOverlay:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, alignItems: 'center', paddingVertical: 2 },
  thumbLabel:      { fontSize: 9, color: '#fff', fontWeight: '600' },
  audioBtn:        { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.shieldPurple, justifyContent: 'center', alignItems: 'center' },
  audioBtnPlaying: { backgroundColor: Colors.sosRed },
  audioBtnTxt:     { fontSize: 24, color: Colors.white },
  fileEmoji:       { fontSize: 32, width: 64, textAlign: 'center' },
  info:            { flex: 1 },
  fileName:        { fontSize: 12, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
  fileType:        { fontSize: 11, marginBottom: 2, fontWeight: '600' },
  fileDate:        { fontSize: 11, color: Colors.textSecondary },
  playing:         { fontSize: 11, color: Colors.safeGreen, fontWeight: '600', marginTop: 2 },
  actions:         { flexDirection: 'column', gap: 6, alignItems: 'center' },
  actionBtn:       { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  iconShare:       { fontSize: 20 },
  iconSave:        { fontSize: 20 },
  iconDelete:      { fontSize: 18 },
  empty:           { alignItems: 'center', marginTop: 80 },
  emptyIcon:       { fontSize: 48, marginBottom: 16 },
  emptyTitle:      { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
  emptySub:        { textAlign: 'center', color: Colors.textSecondary, lineHeight: 22 },
  modalBg:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalCloseBtn:   { position: 'absolute', top: 48, right: 20, zIndex: 10, padding: 10 },
  modalCloseTxt:   { color: Colors.white, fontSize: 16, fontWeight: 'bold' },
  fullImg:         { width: SW, height: SH * 0.7 },
  modalActions:    { position: 'absolute', bottom: 30, flexDirection: 'row', gap: 12 },
  modalShareBtn:   { backgroundColor: Colors.shieldPurple, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  modalShareTxt:   { color: Colors.white, fontWeight: '700', fontSize: 15 },
  modalSaveBtn:    { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1.5, borderColor: Colors.white },
  modalSaveTxt:    { color: Colors.white, fontWeight: '600', fontSize: 14 },
});