import type { ReactNode } from "react";

export type ScreenshotAxisValue = number | `${number}%`;

export type ScreenshotHotspotDefinition = {
	id: string;
	label: string;
	targetId: string;
	top: ScreenshotAxisValue;
	left: ScreenshotAxisValue;
	width: ScreenshotAxisValue;
	height: ScreenshotAxisValue;
	description?: string;
};

export type ScreenshotAreaGroupDefinition = {
	id: string;
	areas: ScreenshotHotspotDefinition[];
};

export type ScreenshotPulsingDotDefinition = {
	id: string;
	x: ScreenshotAxisValue;
	y: ScreenshotAxisValue;
	label: string;
	description: ReactNode;
	step: number;
	side?: "top" | "bottom" | "left" | "right";
	delay?: number;
};

export type ScreenshotScreenDefinition = {
	id: string;
	title: string;
	description: ReactNode;
	src: string;
	alt: string;
	dimensions: {
		width: number;
		height: number;
	};
	areaGroupIds?: string[];
	areas?: ScreenshotHotspotDefinition[];
	hiddenAreaIds?: string[];
	pulsingDots?: ScreenshotPulsingDotDefinition[];
};

export type ScreenshotFlowDefinition = {
	initialScreenId: string;
	screens: ScreenshotScreenDefinition[];
	areaGroups?: ScreenshotAreaGroupDefinition[];
};

export type ScreenshotHotspot = Omit<
	ScreenshotHotspotDefinition,
	"top" | "left" | "width" | "height"
> & {
	top: `${number}%`;
	left: `${number}%`;
	width: `${number}%`;
	height: `${number}%`;
};

export type ScreenshotPulsingDot = Omit<
	ScreenshotPulsingDotDefinition,
	"x" | "y"
> & {
	x: `${number}%`;
	y: `${number}%`;
};

export type ScreenshotScreen = Omit<
	ScreenshotScreenDefinition,
	"areaGroupIds" | "areas" | "pulsingDots"
> & {
	areas: ScreenshotHotspot[];
	pulsingDots: ScreenshotPulsingDot[];
};

export type ResolvedScreenshotFlow = {
	initialScreenId: string;
	screens: ScreenshotScreen[];
	screensById: Record<string, ScreenshotScreen>;
};

export function resolveScreenshotFlow(
	definition: ScreenshotFlowDefinition,
): ResolvedScreenshotFlow {
	const groupMap = new Map(
		(definition.areaGroups ?? []).map((group) => [group.id, group]),
	);
	const screenIds = new Set(definition.screens.map((screen) => screen.id));
	const screensById: Record<string, ScreenshotScreen> = {};

	if (!screenIds.has(definition.initialScreenId)) {
		throw new Error(
			`Unknown initial screenshot screen "${definition.initialScreenId}".`,
		);
	}

	validateUniqueIds(
		definition.screens.map((screen) => screen.id),
		"screenshot screen",
	);
	validateUniqueIds(
		(definition.areaGroups ?? []).map((group) => group.id),
		"screenshot area group",
	);

	const screens = definition.screens.map((screen) => {
		const groupAreas = (screen.areaGroupIds ?? []).flatMap((groupId) => {
			const group = groupMap.get(groupId);

			if (!group) {
				throw new Error(
					`Unknown screenshot area group "${groupId}" used by "${screen.id}".`,
				);
			}

			return group.areas;
		});

		const areas = [...groupAreas, ...(screen.areas ?? [])].map((area) => {
			if (!screenIds.has(area.targetId)) {
				throw new Error(
					`Unknown screenshot target "${area.targetId}" used by hotspot "${area.id}" on "${screen.id}".`,
				);
			}

			return {
				...area,
				top: resolveAxisValue(area.top, screen.dimensions.height),
				left: resolveAxisValue(area.left, screen.dimensions.width),
				width: resolveAxisValue(area.width, screen.dimensions.width),
				height: resolveAxisValue(area.height, screen.dimensions.height),
			};
		});
		const pulsingDots = (screen.pulsingDots ?? []).map((dot) => ({
			...dot,
			x: resolveAxisValue(dot.x, screen.dimensions.width),
			y: resolveAxisValue(dot.y, screen.dimensions.height),
		}));

		validateUniqueIds(
			areas.map((area) => area.id),
			`hotspot on "${screen.id}"`,
		);
		validateUniqueIds(
			pulsingDots.map((dot) => dot.id),
			`pulsing dot on "${screen.id}"`,
		);
		validateUniqueIds(
			screen.hiddenAreaIds ?? [],
			`hidden hotspot on "${screen.id}"`,
		);

		const areaIds = new Set(areas.map((area) => area.id));

		for (const hiddenAreaId of screen.hiddenAreaIds ?? []) {
			if (!areaIds.has(hiddenAreaId)) {
				throw new Error(
					`Unknown hidden hotspot "${hiddenAreaId}" on "${screen.id}".`,
				);
			}
		}

		const resolvedScreen: ScreenshotScreen = {
			id: screen.id,
			title: screen.title,
			description: screen.description,
			src: screen.src,
			alt: screen.alt,
			dimensions: screen.dimensions,
			areas,
			hiddenAreaIds: screen.hiddenAreaIds ?? [],
			pulsingDots,
		};

		screensById[resolvedScreen.id] = resolvedScreen;

		return resolvedScreen;
	});

	return {
		initialScreenId: definition.initialScreenId,
		screens,
		screensById,
	};
}

function resolveAxisValue(
	value: ScreenshotAxisValue,
	total: number,
): `${number}%` {
	if (typeof value === "string") {
		return value;
	}

	const percentage = (value / total) * 100;

	return `${Number(percentage.toFixed(4))}%`;
}

function validateUniqueIds(ids: string[], entityName: string) {
	const seen = new Set<string>();

	for (const id of ids) {
		if (seen.has(id)) {
			throw new Error(`Duplicate ${entityName} id "${id}".`);
		}

		seen.add(id);
	}
}
