export interface CharacterOption {
  id: string;
  label: string;
  path: string;
}

export const CHARACTER_OPTIONS: CharacterOption[] = [
  { id: "maia", label: "Maia", path: "img/maia.png" },
  { id: "benni", label: "Benni", path: "img/benni.png" },
  { id: "maia-google", label: "Mirana", path: "img/maia-google.png" },
];

// Modul-weiter Zustand: von CharacterSelectScene gesetzt, von MainScene beim
// Laden der "maia"-Textur gelesen. ES-Module exportieren lebende Bindungen,
// d.h. andere Dateien sehen Änderungen über setSelectedCharacterPath sofort.
let selectedCharacterPath: string = CHARACTER_OPTIONS[0].path;

export function getSelectedCharacterPath(): string {
  return selectedCharacterPath;
}

export function setSelectedCharacterPath(path: string): void {
  selectedCharacterPath = path;
}
