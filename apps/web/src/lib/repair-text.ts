// Repair UTF-8 bytes previously decoded as Windows-1252, one sequence at a time.
// Keep original Unicode outside those sequences and never change stored records.
const WINDOWS_1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function byteOf(character: string): number {
  const code = character.charCodeAt(0);
  if (code <= 255) return code;
  const index = WINDOWS_1252.indexOf(character);
  return index < 0 ? -1 : index + 128;
}

export function repairDisplayText(value: string): string {
  if (!/[\u00C2-\u00F4]/.test(value)) return value;
  let text = value;
  for (let pass = 0; pass < 2; pass += 1) {
    let output = '';
    for (let index = 0; index < text.length; index += 1) {
      const lead = text.charCodeAt(index);
      const length = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
      const bytes = length && index + length <= text.length
        ? Array.from(text.slice(index, index + length), byteOf)
        : [];
      if (bytes.length === length && length && bytes.slice(1).every((byte) => byte >= 0x80 && byte <= 0xbf)) {
        try {
          output += decoder.decode(Uint8Array.from(bytes));
          index += length - 1;
          continue;
        } catch {
          // Leave invalid UTF-8 sequences verbatim.
        }
      }
      output += text[index];
    }
    if (output === text) break;
    text = output;
  }
  return text;
}
