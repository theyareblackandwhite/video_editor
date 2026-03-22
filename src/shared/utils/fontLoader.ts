import WebFont from 'webfontloader';

export const GOOGLE_FONTS = [
  'Inter',
  'Impact',
  'Montserrat',
  'Oswald',
  'Roboto',
  'Arial',
  'Anton',
  'Bebas Neue',
  'Bangers',
  'Luckiest Guy',
  'Permanent Marker',
  'Roboto Condensed',
  'Open Sans',
  'Lato',
  'Poppins',
  'Raleway',
];

const loadedFonts = new Set<string>();

export const loadGoogleFont = (fontFamily: string) => {
  if (loadedFonts.has(fontFamily)) return;
  if (['Arial', 'Impact', 'Times New Roman'].includes(fontFamily)) return;

  WebFont.load({
    google: {
      families: [fontFamily],
    },
    active: () => {
      loadedFonts.add(fontFamily);
      console.log(`Font loaded: ${fontFamily}`);
    },
  });
};
