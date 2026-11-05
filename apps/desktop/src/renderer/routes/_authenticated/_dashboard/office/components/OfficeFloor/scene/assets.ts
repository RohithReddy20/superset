import floorsUrl from "../assets/floors.png";
import decor from "../assets/props_decor.json";
import decorUrl from "../assets/props_decor.png";
import deskItems from "../assets/props_desk_items.json";
import deskItemsUrl from "../assets/props_desk_items.png";
import desks from "../assets/props_desks.json";
import desksUrl from "../assets/props_desks.png";
import kitchen from "../assets/props_kitchen.json";
import kitchenUrl from "../assets/props_kitchen.png";
import meeting from "../assets/props_meeting.json";
import meetingUrl from "../assets/props_meeting.png";
import seating from "../assets/props_seating.json";
import seatingUrl from "../assets/props_seating.png";
import storage from "../assets/props_storage.json";
import storageUrl from "../assets/props_storage.png";
import tech from "../assets/props_tech.json";
import techUrl from "../assets/props_tech.png";
import wallsUrl from "../assets/walls.png";
import workerUrl from "../assets/worker.png";

export interface PropFrame {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Image pixel that sits on the footprint's top-left map corner. */
	ax: number;
	ay: number;
	fw: number;
	fh: number;
}

export const PROP_ATLASES: Record<
	string,
	{ url: string; frames: Record<string, PropFrame> }
> = {
	decor: { url: decorUrl, frames: decor },
	desk_items: { url: deskItemsUrl, frames: deskItems },
	desks: { url: desksUrl, frames: desks },
	kitchen: { url: kitchenUrl, frames: kitchen },
	meeting: { url: meetingUrl, frames: meeting },
	seating: { url: seatingUrl, frames: seating },
	storage: { url: storageUrl, frames: storage },
	tech: { url: techUrl, frames: tech },
};

export const TILESET_URLS = {
	floors: floorsUrl,
	walls: wallsUrl,
	worker: workerUrl,
};

export function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`could not load ${url}`));
		image.src = url;
	});
}
