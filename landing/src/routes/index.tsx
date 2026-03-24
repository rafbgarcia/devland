import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Download, Github } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { devlandScreenshotFlow } from "#/features/screenshot-flow/devland-screenshot-flow";
import { ScreenshotFlowViewer } from "#/features/screenshot-flow/screenshot-flow-viewer";
import { Kbd } from "#/components/ui/kbd";

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
			<header className="text-right max-w-7xl mx-auto mt-4">
				<a
					href={"https://github.com/rafbgarcia/devland/releases/latest"}
					className="group text-sm  inline-flex items-center gap-3 rounded px-3 py-2 font-medium text-slate-400 hover:underline"
				>
					<Github className="size-4" />
					<span>Download on Github</span>
				</a>
			</header>

			{/* Hero */}
			<section className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pt-14 pb-16 text-center">
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
				>
					<div className="relative">
						<img src="/devland.png" loading="lazy" width={90} className="absolute right-full -top-2" />
						<h1 className="font-bold tracking-tight text-white text-5xl sm:text-7xl">
							Devland
						</h1>
					</div>
					<p className="mt-3 text-xl sm:text-2xl text-slate-100">
						Builders' homeland
					</p>
					<p className="mt-0 text-xs text-slate-300">
						100% free, open-source, and local to your machine
					</p>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
				>
					<div className="text-slate-200 mt-10">
						<p>
							What if we could view everything related to a project in a single place?
						</p>
						<p>
							Code review, issues, bugs, infra, observability, errors, Q&A, chat, ...
						</p>
						<p>
							Meet Devland.
						</p>
					</div>
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

			<motion.div
					initial={{ opacity: 0, scale: 0.92 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
					className="text-slate-200 text-center text-sm mb-10"
				>
					Built with ❤️ for builders
				</motion.div>
		</main>
	);
}

function isFlowScreenId(screenId: string | undefined): screenId is string {
	return (
		screenId !== undefined && screenId in devlandScreenshotFlow.screensById
	);
}
