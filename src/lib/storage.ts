/**
 * SAILL - SRIT AI Language Laboratory
 * Supabase Storage Service
 *
 * Handles persistent audio recordings, student portfolio files, and media.
 */

import { supabase } from './supabase';

export const BUCKET_AUDIO = 'audio-recordings';
export const BUCKET_PORTFOLIO = 'portfolio-files';
export const BUCKET_AVATARS = 'avatars';

export class StorageService {
  /**
   * Upload an audio recording blob to Supabase Storage
   */
  static async uploadAudioRecording(
    audioBlob: Blob,
    filename: string,
    studentRollNo: string
  ): Promise<{ path: string; publicUrl: string }> {
    const cleanRoll = studentRollNo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const path = `${cleanRoll}/${Date.now()}_${filename}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_AUDIO)
      .upload(path, audioBlob, {
        contentType: audioBlob.type || 'audio/webm',
        upsert: true
      });

    if (error) {
      console.warn('[StorageService] Audio upload notice:', error.message);
      // Fallback: generate local object URL if bucket is in setup mode
      return {
        path,
        publicUrl: URL.createObjectURL(audioBlob)
      };
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_AUDIO)
      .getPublicUrl(data.path);

    return {
      path: data.path,
      publicUrl: urlData.publicUrl
    };
  }

  /**
   * Upload a student portfolio file (PDF, DOCX, image, or audio)
   */
  static async uploadPortfolioFile(
    file: File | Blob,
    filename: string,
    studentRollNo: string
  ): Promise<{ path: string; publicUrl: string }> {
    const cleanRoll = studentRollNo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const path = `${cleanRoll}/${Date.now()}_${filename}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_PORTFOLIO)
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true
      });

    if (error) {
      console.warn('[StorageService] Portfolio upload notice:', error.message);
      return {
        path,
        publicUrl: URL.createObjectURL(file)
      };
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_PORTFOLIO)
      .getPublicUrl(data.path);

    return {
      path: data.path,
      publicUrl: urlData.publicUrl
    };
  }

  /**
   * Remove a file from Supabase Storage
   */
  static async deleteFile(bucket: string, path: string): Promise<boolean> {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    return !error;
  }
}
