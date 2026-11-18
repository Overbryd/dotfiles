import type { Model, SimpleStreamOptions, StreamFunction } from "@earendil-works/pi-ai/compat";

type VertexStream = StreamFunction<"google-vertex", SimpleStreamOptions>;
type Cost = Model<"google-vertex">["cost"];

const REQUEST_TYPE = "x-vertex-ai-llm-request-type";
const SHARED_REQUEST_TYPE = "x-vertex-ai-llm-shared-request-type";
// Published global USD / million tokens. Argon and Carbon are equal; the promotion is a billing credit.
const PROMO_END = Date.UTC(2026, 11, 1);
const HYDROGEN = {
	standard: { input: 1.50, output: 7.50, cacheRead: 0.075, cacheWrite: 1.875 },
	priority: { input: 2.70, output: 13.50, cacheRead: 0.135, cacheWrite: 3.375 },
};
const ARGON_CARBON = {
	standard: { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 0 },
	priority: { input: 7.20, output: 36, cacheRead: 0.36, cacheWrite: 0 },
};
const ARGON_CARBON_PROMO = {
	standard: { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 0 },
	priority: { input: 3.60, output: 18, cacheRead: 0.18, cacheWrite: 0 },
};

function pricesFor(id: string): { standard: Cost; priority: Cost } | undefined {
	if (id === "gemini-4-hydrogen") return HYDROGEN;
	if (id === "gemini-4-argon" || id === "gemini-4-carbon") {
		return Date.now() < PROMO_END ? ARGON_CARBON_PROMO : ARGON_CARBON;
	}
	return undefined;
}

function withoutTierHeaders<T extends string | null>(headers: Record<string, T> | undefined): Record<string, T> {
	return Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => {
		const key = name.toLowerCase();
		return key !== REQUEST_TYPE && key !== SHARED_REQUEST_TYPE;
	}));
}

export function withVertexPriorityPayGo(start: VertexStream, enabled: () => boolean): VertexStream {
	return (model, context, options) => {
		if (!enabled() || model.provider !== "google-vertex") return start(model, context, options);
		const location = options?.env?.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_CLOUD_LOCATION;
		const project = options?.env?.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
			|| options?.env?.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT;
		const prices = location === "global" && project ? pricesFor(model.id) : undefined;
		if (!prices) return start(model, context, options);

		// The adapter reads cost after onProviderStreamEvent for each usage chunk. Keep the chosen price local to this request.
		const requestModel = { ...model, headers: withoutTierHeaders(model.headers), cost: { ...prices.standard } };
		return start(requestModel, context, {
			...options,
			headers: { ...withoutTierHeaders(options?.headers), [REQUEST_TYPE]: "shared", [SHARED_REQUEST_TYPE]: "priority" },
			onProviderStreamEvent: (chunk, originalModel) => {
				const trafficType = (chunk as { usageMetadata?: { trafficType?: string } } | undefined)?.usageMetadata?.trafficType;
				if (trafficType === "ON_DEMAND_PRIORITY") requestModel.cost = { ...prices.priority };
				else if (trafficType === "ON_DEMAND") requestModel.cost = { ...prices.standard };
				return options?.onProviderStreamEvent?.(chunk, originalModel);
			},
		});
	};
}
