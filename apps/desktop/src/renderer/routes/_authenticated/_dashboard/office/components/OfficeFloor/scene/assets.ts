import type { WorldMap } from "../../../utils/world";
import worldMap from "../assets/world/office.map.json";

export const WORLD_MAP = worldMap as WorldMap;

const imageUrls = import.meta.glob<string>("../assets/world/office.*", {
	eager: true,
	query: "?url",
	import: "default",
});

export const WORLD_IMAGE_URL = (() => {
	const match = Object.keys(imageUrls).find((k) =>
		/\/world\/office\.(webp|png|jpg)$/.test(k),
	);
	if (!match) throw new Error("missing office world image");
	return imageUrls[match] as string;
})();
