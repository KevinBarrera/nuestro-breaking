// True when the text holds a C0 control character (U+0000 to U+001F) or DEL (U+007F). The
// backend refuses those in passwords and reasons, so forms check them before a request.
export function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
