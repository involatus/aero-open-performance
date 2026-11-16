/**
 * The screens iOS and iPadOS show while the home-screen app starts. iOS uses one only when its media query matches
 * the device exactly, so each screen size needs its own image: width and height in points, portrait, and the pixel ratio.
 * `npm run brand` draws the plain AoP ones and writes their links into src/app.html; the server draws a club's own.
 */
export const SPLASH_SCREENS: [string, number, number, number][] = [
	['iPhone 16 Pro Max, 17 Pro Max', 440, 956, 3],
	['iPhone Air', 420, 912, 3],
	['iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus', 430, 932, 3],
	['iPhone 12 Pro Max, 13 Pro Max, 14 Plus', 428, 926, 3],
	['iPhone 16 Pro, 17, 17 Pro', 402, 874, 3],
	['iPhone 14 Pro, 15, 15 Pro, 16', 393, 852, 3],
	['iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e', 390, 844, 3],
	['iPhone X, XS, 11 Pro, 12 mini, 13 mini', 375, 812, 3],
	['iPhone XS Max, 11 Pro Max', 414, 896, 3],
	['iPhone XR, 11', 414, 896, 2],
	['iPhone 6 Plus to 8 Plus', 414, 736, 3],
	['iPhone 6 to 8, SE 2nd and 3rd generation', 375, 667, 2],
	['iPhone SE 1st generation', 320, 568, 2],
	['iPad Pro 13-inch (M4 and later)', 1032, 1376, 2],
	['iPad Pro 12.9-inch, iPad Air 13-inch', 1024, 1366, 2],
	['iPad Pro 11-inch (M4 and later)', 834, 1210, 2],
	['iPad Pro 11-inch', 834, 1194, 2],
	['iPad Air 10.9-inch and 11-inch, iPad 10th generation and later', 820, 1180, 2],
	['iPad Air 3rd generation, iPad Pro 10.5-inch', 834, 1112, 2],
	['iPad 7th to 9th generation', 810, 1080, 2],
	['iPad mini 6th generation and later', 744, 1133, 2],
	['iPad 9.7-inch, iPad mini 5th generation and earlier', 768, 1024, 2]
];

export type SplashImage = { file: string; w: number; h: number; ratio: number; devices: string; orientation: 'portrait' | 'landscape'; media: string };

/** Every splash image, in both orientations, with its pixel size and the media query that picks it. */
export const SPLASH_IMAGES: SplashImage[] = SPLASH_SCREENS.flatMap(([devices, pw, ph, ratio]) =>
	(['portrait', 'landscape'] as const).map((orientation) => {
		const [w, h] = orientation === 'portrait' ? [pw * ratio, ph * ratio] : [ph * ratio, pw * ratio];
		// device-width and device-height are the portrait size in either orientation.
		const media = `(device-width: ${pw}px) and (device-height: ${ph}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`;
		return { file: `splash-${w}x${h}.png`, w, h, ratio, devices, orientation, media };
	})
);
