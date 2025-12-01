const CryptoJS = require('crypto-js');

/**
 * Converts a string to a 32-character hex key.
 * Kotlin: id.map { it.code.toString(16) }.joinToString("").substring(0, 32)
 * @param {string} id - The input string (base64Decode(show_id) + IV).
 * @returns {string} The 32-character hex key.
 */
function getKey(id) {
    try {
        let hexString = '';
        for (let i = 0; i < id.length; i++) {
            hexString += id.charCodeAt(i).toString(16);
        }
        return hexString.substring(0, 32);
    } catch (e) {
        console.error("Error generating key:", e);
        return null;
    }
}

/**
 * Handles AES-128-CBC encryption/decryption with PKCS5Padding.
 * Kotlin: cryptoHandler
 * @param {string} data - The data to encrypt/decrypt.
 * @param {string} iv - The initialization vector.
 * @param {string} secretKeyString - The secret key.
 * @param {boolean} [encrypt=true] - Whether to encrypt or decrypt.
 * @returns {string} The processed data.
 */
function cryptoHandler(data, iv, secretKeyString, encrypt = true) {
    const key = CryptoJS.enc.Utf8.parse(secretKeyString);
    const ivParsed = CryptoJS.enc.Utf8.parse(iv);

    if (encrypt) {
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            iv: ivParsed,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7 // CryptoJS uses Pkcs7, which is equivalent to PKCS5Padding for 8-byte block size
        });
        return encrypted.toString();
    } else {
        // Decryption: input is Base64 encoded
        const decrypted = CryptoJS.AES.decrypt(data, key, {
            iv: ivParsed,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return decrypted.toString(CryptoJS.enc.Utf8);
    }
}

module.exports = {
    getKey,
    cryptoHandler,
};
