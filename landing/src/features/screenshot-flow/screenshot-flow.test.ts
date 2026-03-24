import { describe, expect, it } from "vitest";
import { resolveScreenshotFlow } from "./screenshot-flow";
import { getVisibleAreas } from "./screenshot-flow-viewer";

describe("resolveScreenshotFlow", () => {
	it("normalizes pixel hotspot coordinates and merges shared groups", () => {
		const flow = resolveScreenshotFlow({
			initialScreenId: "screen-a",
			areaGroups: [
				{
					id: "shared-tabs",
					areas: [
						{
							id: "tab-b",
							label: "Open B",
							targetId: "screen-b",
							top: 100,
							left: 200,
							width: 300,
							height: 80,
						},
					],
				},
			],
			screens: [
				{
					id: "screen-a",
					title: "Screen A",
					description: "The first screen.",
					src: "/images/a.png",
					alt: "Screenshot A",
					dimensions: {
						width: 1000,
						height: 500,
					},
					areaGroupIds: ["shared-tabs"],
					pulsingDots: [
						{
							id: "community-dot",
							x: 250,
							y: 125,
							label: "Community tab",
							description: "Open the community workspace.",
							step: 1,
							side: "top",
						},
					],
					areas: [
						{
							id: "screen-c",
							label: "Open C",
							targetId: "screen-c",
							top: "10%",
							left: "20%",
							width: "30%",
							height: "40%",
						},
					],
				},
				{
					id: "screen-b",
					title: "Screen B",
					description: "The second screen.",
					src: "/images/b.png",
					alt: "Screenshot B",
					dimensions: {
						width: 1000,
						height: 500,
					},
				},
				{
					id: "screen-c",
					title: "Screen C",
					description: "The third screen.",
					src: "/images/c.png",
					alt: "Screenshot C",
					dimensions: {
						width: 1000,
						height: 500,
					},
				},
			],
		});

		expect(flow.screensById["screen-a"].areas).toEqual([
			expect.objectContaining({
				id: "tab-b",
				top: "20%",
				left: "20%",
				width: "30%",
				height: "16%",
			}),
			expect.objectContaining({
				id: "screen-c",
				top: "10%",
				left: "20%",
				width: "30%",
				height: "40%",
			}),
		]);
		expect(flow.screensById["screen-a"].pulsingDots).toEqual([
			expect.objectContaining({
				id: "community-dot",
				x: "25%",
				y: "25%",
			}),
		]);
	});

	it("throws a clear error when a hotspot references an unknown target", () => {
		expect(() =>
			resolveScreenshotFlow({
				initialScreenId: "screen-a",
				screens: [
					{
						id: "screen-a",
						title: "Screen A",
						description: "The first screen.",
						src: "/images/a.png",
						alt: "Screenshot A",
						dimensions: {
							width: 1000,
							height: 500,
						},
						areas: [
							{
								id: "broken",
								label: "Broken target",
								targetId: "missing",
								top: 0,
								left: 0,
								width: 100,
								height: 100,
							},
						],
					},
				],
			}),
		).toThrow('Unknown screenshot target "missing"');
	});

	it("hides self-targeting and explicitly hidden hotspots", () => {
		expect(
			getVisibleAreas({
				id: "screen-a",
				hiddenAreaIds: ["go-c"],
				areas: [
					{
						id: "stay-here",
						label: "Screen A",
						targetId: "screen-a",
						top: "0%",
						left: "0%",
						width: "10%",
						height: "10%",
					},
					{
						id: "go-b",
						label: "Screen B",
						targetId: "screen-b",
						top: "10%",
						left: "10%",
						width: "10%",
						height: "10%",
					},
					{
						id: "go-c",
						label: "Screen C",
						targetId: "screen-c",
						top: "20%",
						left: "20%",
						width: "10%",
						height: "10%",
					},
				],
			}),
		).toEqual([
			expect.objectContaining({
				id: "go-b",
				targetId: "screen-b",
			}),
		]);
	});

	it("throws a clear error when a screen hides an unknown hotspot", () => {
		expect(() =>
			resolveScreenshotFlow({
				initialScreenId: "screen-a",
				screens: [
					{
						id: "screen-a",
						title: "Screen A",
						description: "The first screen.",
						src: "/images/a.png",
						alt: "Screenshot A",
						dimensions: {
							width: 1000,
							height: 500,
						},
						hiddenAreaIds: ["missing-hotspot"],
						areas: [
							{
								id: "go-b",
								label: "Screen B",
								targetId: "screen-b",
								top: 0,
								left: 0,
								width: 100,
								height: 100,
							},
						],
					},
					{
						id: "screen-b",
						title: "Screen B",
						description: "The second screen.",
						src: "/images/b.png",
						alt: "Screenshot B",
						dimensions: {
							width: 1000,
							height: 500,
						},
					},
				],
			}),
		).toThrow('Unknown hidden hotspot "missing-hotspot"');
	});
});
