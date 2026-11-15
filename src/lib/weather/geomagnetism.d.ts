declare module 'geomagnetism' {
	type Point = { decl: number };
	type TimedModel = { point(coords: [number, number] | [number, number, number]): Point };
	const geomagnetism: { model(date?: Date, options?: { allowOutOfBoundsModel?: boolean }): TimedModel };
	export default geomagnetism;
}
