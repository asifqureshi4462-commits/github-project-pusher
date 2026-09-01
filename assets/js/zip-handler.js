/**
 * ZIP and File Processing Engine
 * Preserves folder hierarchy, extracts binary content, filters system junk files
 */
class ZipHandler {
  // Ignored OS metadata files
  static IGNORED_FILES = [
    '.DS_Store',
    'Thumbs.db',
    '__MACOSX/',
    'desktop.ini'
  ];

  static isIgnored(path) {
    return this.IGNORED_FILES.some(ignored => 
      path === ignored || path.startsWith('__MACOSX/') || path.endsWith('/.DS_Store') || path.endsWith('/Thumbs.db')
    );
  }

  /**
   * Process a ZIP file into an array of { path, base64, size }
   */
  static async extractZip(file, onProgress) {
    if (!window.JSZip) {
      throw new Error('JSZip library is not loaded.');
    }

    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    const files = [];
    const entries = Object.keys(contents.files);
    let processed = 0;

    // Detect if zip has a single root folder wrapping everything
    const nonDirEntries = entries.filter(path => !contents.files[path].dir && !this.isIgnored(path));
    if (nonDirEntries.length === 0) {
      throw new Error('The ZIP archive is empty or contains only ignored system files.');
    }

    for (const relativePath of entries) {
      const zipEntry = contents.files[relativePath];
      
      // Skip directories and ignored OS files
      if (zipEntry.dir || this.isIgnored(relativePath)) {
        continue;
      }

      // Convert to Base64 for GitHub Git Blob API
      const base64Data = await zipEntry.async('base64');
      const uint8 = await zipEntry.async('uint8array');

      files.push({
        path: relativePath.replace(/^\/+/, ''), // normalize leading slashes
        base64: base64Data,
        size: uint8.length
      });

      processed++;
      if (onProgress) {
        onProgress(processed, nonDirEntries.length);
      }
    }

    return files;
  }

  /**
   * Process standard FileList (from folder picker or multi-file picker)
   */
  static async extractFiles(fileList, onProgress) {
    const files = [];
    let processed = 0;

    for (const file of fileList) {
      const relativePath = file.webkitRelativePath || file.name;
      if (this.isIgnored(relativePath)) continue;

      const base64Data = await this.fileToBase64(file);

      files.push({
        path: relativePath.replace(/^\/+/, ''),
        base64: base64Data,
        size: file.size
      });

      processed++;
      if (onProgress) {
        onProgress(processed, fileList.length);
      }
    }

    return files;
  }

  static fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        // Strip data:*;base64, prefix
        const base64 = result.substring(result.indexOf(',') + 1);
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}