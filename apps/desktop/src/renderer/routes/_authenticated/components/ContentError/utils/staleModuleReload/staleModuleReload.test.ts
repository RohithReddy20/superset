import { describe, expect, test } from "bun:test";
import { staleModuleReload } from "./staleModuleReload";

const stale = new TypeError(
	"Failed to fetch dynamically imported module: http://localhost:3005/routes/office/city/page.tsx",
);

describe("staleModuleReload", () => {
	test("allows a reload for a view whose module failed to load", () => {
		expect(staleModuleReload(stale, 1000, [])).toEqual([1000]);
	});

	test("leaves other errors to the person", () => {
		expect(staleModuleReload(new Error("x is not a function"), 1000, [])).toBe(
			null,
		);
	});

	test("stops after three reloads in a minute and forgets old ones", () => {
		expect(staleModuleReload(stale, 50_000, [10_000, 20_000, 30_000])).toBe(
			null,
		);
		expect(staleModuleReload(stale, 75_000, [10_000, 20_000, 30_000])).toEqual([
			20_000, 30_000, 75_000,
		]);
	});
});
