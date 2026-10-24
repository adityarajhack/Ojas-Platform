import { db } from '../../core/database/db';
import { storageService } from '../../core/storage/storage';
import { NotFoundError } from '../../core/errors/rfc9457';

export class DocumentsService {
  // Upload and store in citizen document wallet
  async uploadToWallet(params: {
    personUid: string;
    docType: string;
    filename: string;
    mimeType: string;
    data: Buffer;
  }) {
    const stored = await storageService.uploadDocument(
      params.personUid,
      params.docType,
      params.filename,
      params.mimeType,
      params.data
    );

    const doc = db.insert('documents', {
      person_uid: params.personUid,
      doc_type: params.docType,
      original_filename: params.filename,
      mimeType: params.mimeType,
      file_size_bytes: stored.fileSizeBytes,
      storage_key: stored.storageKey,
      checksum_sha256: stored.checksumSha256,
      is_encrypted: stored.isEncrypted,
      iv_hex: stored.ivHex,
      verification_status: 'PENDING',
      malware_scanned: stored.malwareClean,
      expires_at: stored.expiresAt,
    });

    // Create initial version
    db.insert('document_versions', {
      document_id: doc.id,
      version_number: 1,
      storage_key: stored.storageKey,
      checksum_sha256: stored.checksumSha256,
    });

    return {
      documentId: doc.id,
      docType: doc.doc_type,
      checksumSha256: doc.checksum_sha256,
      signedUrl: stored.signedUrl,
      malwareClean: stored.malwareClean,
    };
  }

  // Get citizen document wallet (Upload once, reuse across schemes)
  getCitizenWallet(personUid: string) {
    const docs = db.getTable('documents').filter((d) => d.person_uid === personUid);
    return docs.map((doc) => ({
      documentId: doc.id,
      docType: doc.doc_type,
      filename: doc.original_filename,
      checksumSha256: doc.checksum_sha256,
      verificationStatus: doc.verification_status,
      signedDownloadUrl: storageService.generateSignedUrl(doc.storage_key, 3600),
      createdAt: doc.created_at,
    }));
  }

  // Verify document by official
  verifyDocument(documentId: string, status: 'VERIFIED' | 'REJECTED') {
    const docs = db.getTable('documents');
    const doc = docs.find((d) => d.id === documentId);
    if (!doc) throw new NotFoundError('Document not found');

    doc.verification_status = status;
    return { documentId: doc.id, verificationStatus: doc.verification_status };
  }
}

export const documentsService = new DocumentsService();
