import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { PulsingDot } from "#/components/PulsingDot";
import { cn } from "#/lib/utils";
import type {
	ResolvedScreenshotFlow,
	ScreenshotHotspot,
	ScreenshotScreen,
} from "./screenshot-flow";

type ScreenshotFlowViewerProps = {
	flow: ResolvedScreenshotFlow;
	className?: string;
	currentScreenId?: string;
	onCurrentScreenChange?: (screenId: string) => void;
};

type ViewerState = {
	currentScreenId: string;
	history: string[];
};

export function ScreenshotFlowViewer({
	flow,
	className,
	currentScreenId: controlledScreenId,
	onCurrentScreenChange,
}: ScreenshotFlowViewerProps) {
	const [state, setState] = useState<ViewerState>({
		currentScreenId: controlledScreenId ?? flow.initialScreenId,
		history: [],
	});
	const [hasHoveredScreenshot, setHasHoveredScreenshot] = useState(false);
	const [isScreenshotHovered, setIsScreenshotHovered] = useState(false);
	const currentScreenId = controlledScreenId ?? state.currentScreenId;

	useEffect(() => {
		if (controlledScreenId === undefined) {
			return;
		}

		setState((prev) =>
			prev.currentScreenId === controlledScreenId
				? prev
				: { ...prev, currentScreenId: controlledScreenId },
		);
	}, [controlledScreenId]);

	const currentScreen = getScreen(flow, currentScreenId);
	const visibleAreas = getVisibleAreas(currentScreen);
	const showInteractiveOverlays =
		!hasHoveredScreenshot || isScreenshotHovered;

	useEffect(() => {
		for (const screen of flow.screens) {
			const image = new Image();
			image.src = screen.src;
		}
	}, [flow.screens]);

	function openScreen(targetId: string) {
		if (targetId === currentScreenId) return;

		setState((prev) => ({
			currentScreenId: targetId,
			history: [...prev.history, currentScreenId],
		}));
		onCurrentScreenChange?.(targetId);
	}

	return (
		<div className={cn("flex flex-col", className)}>
			{/* Screenshot */}
			<div className="relative overflow-hidden rounded-t-2xl border border-b-0 border-white/8 bg-slate-950/70 shadow-2xl shadow-black/50">
				<div
					className="relative aspect-[1440/870] w-full"
					onMouseEnter={() => {
						setHasHoveredScreenshot(true);
						setIsScreenshotHovered(true);
					}}
					onMouseLeave={() => {
						setIsScreenshotHovered(false);
					}}
				>
					<AnimatePresence mode="wait">
						<motion.img
							key={currentScreen.id}
							src={currentScreen.src}
							alt={currentScreen.alt}
							className="absolute inset-0 size-full object-cover object-bottom"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0 }}
						/>
					</AnimatePresence>

					<div
						className={cn(
							"absolute inset-0 transition-opacity duration-200",
							showInteractiveOverlays
								? "pointer-events-auto opacity-100"
								: "pointer-events-none opacity-0",
						)}
					>
						{visibleAreas.map((area, index) => (
							<HotspotButton
								key={`${currentScreen.id}-${area.id}`}
								area={area}
								index={index}
								onOpen={openScreen}
							/>
						))}
					</div>

					<div
						className={cn(
							"pointer-events-none absolute inset-0 transition-opacity duration-200",
							showInteractiveOverlays
								? "opacity-100"
								: "opacity-0",
						)}
					>
						{currentScreen.pulsingDots.map((dot, index) => (
							<PulsingDot
								key={`${currentScreen.id}-${dot.id}`}
								x={dot.x}
								y={dot.y}
								label={dot.label}
								description={dot.description}
								step={dot.step}
								side={dot.side}
								delay={(dot.delay ?? 0) + (hasHoveredScreenshot ? 0 : (index + 1) * 1)}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

type HotspotButtonProps = {
	area: ScreenshotHotspot;
	index: number;
	onOpen: (screenId: string) => void;
};

function HotspotButton({ area, index, onOpen }: HotspotButtonProps) {
	return (
		<motion.button
			type="button"
			onClick={() => onOpen(area.targetId)}
			aria-label={area.label}
			title={area.description ?? area.label}
			className="group absolute cursor-pointer rounded border border-emerald-300/20 bg-emerald-400/5 outline-none transition-all hover:bg-emerald-400/10"
			style={{
				top: area.top,
				left: area.left,
				width: area.width,
				height: area.height,
			}}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{
				delay: 0.15 + index * 0.04,
				duration: 0.3,
			}}
		/>
	);
}

function getScreen(flow: ResolvedScreenshotFlow, screenId: string) {
	const screen = flow.screensById[screenId];

	if (!screen) {
		throw new Error(`Unknown screenshot screen "${screenId}".`);
	}

	return screen;
}

export function getVisibleAreas(
	screen: Pick<ScreenshotScreen, "id" | "areas" | "hiddenAreaIds">,
) {
	const hiddenAreaIds = screen.hiddenAreaIds ?? [];

	return screen.areas.filter(
		(area) => area.targetId !== screen.id && !hiddenAreaIds.includes(area.id),
	);
}
