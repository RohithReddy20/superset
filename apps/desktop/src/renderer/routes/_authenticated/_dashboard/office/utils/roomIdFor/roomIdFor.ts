/** A room id the office accepts (2-24 of a-z, 0-9, -) made from a name, not one of `taken`. */
export function roomIdFor(name: string, taken: string[]): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 20)
		.replace(/-+$/, "");
	const base = slug.length >= 2 ? slug : slug ? `${slug}-room` : "room";
	let id = base;
	for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
	return id;
}
