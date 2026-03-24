import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect } from "react";
import { devlandScreenshotFlow } from "#/features/screenshot-flow/devland-screenshot-flow";
import { ScreenshotFlowViewer } from "#/features/screenshot-flow/screenshot-flow-viewer";

type LandingSearch = {
	screen?: string;
};

export const Route = createFileRoute("/")({
	validateSearch: (search): LandingSearch => ({
		screen: typeof search.screen === "string" ? search.screen : undefined,
	}),
	component: LandingPage,
});

function LandingPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const currentScreenId = isFlowScreenId(search.screen)
		? search.screen
		: devlandScreenshotFlow.initialScreenId;

	useEffect(() => {
		if (!search.screen || isFlowScreenId(search.screen)) {
			return;
		}

		void navigate({
			search: {},
			replace: true,
			resetScroll: false,
		});
	}, [navigate, search.screen]);

	function handleCurrentScreenChange(screenId: string) {
		void navigate({
			search:
				screenId === devlandScreenshotFlow.initialScreenId
					? {}
					: { screen: screenId },
			replace: true,
			resetScroll: false,
		});
	}

	return (
		<main className="min-h-screen bg-slate-950">
			{/* Subtle gradient backdrop */}
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(16,185,129,0.08),transparent_60%)]" />

			{/* Hero */}
			<section className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pt-32 pb-16 text-center">
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
				>
					<h1 className="font-bold tracking-tight text-white text-5xl sm:text-7xl">
						Devland
					</h1>
					<p className="mt-3 text-2xl sm:text-4xl text-gray-200">
						Your hackable development workspace
					</p>
				</motion.div>
			</section>

			{/* Interactive product tour */}
			<section className="relative mx-auto max-w-7xl px-6 pb-24">
				<motion.div
					initial={{ opacity: 0, scale: 0.92 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
				>
					<ScreenshotFlowViewer
						flow={devlandScreenshotFlow}
						currentScreenId={currentScreenId}
						onCurrentScreenChange={handleCurrentScreenChange}
					/>
				</motion.div>
			</section>
		</main>
	);
}

function isFlowScreenId(screenId: string | undefined): screenId is string {
	return (
		screenId !== undefined && screenId in devlandScreenshotFlow.screensById
	);
}
