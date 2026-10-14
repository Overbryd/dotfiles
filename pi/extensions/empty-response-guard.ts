import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CUSTOM_TYPE = "empty-response-guard";
const RETRY_PROMPT =
	"The provider returned an empty final response. Continue the task from the preceding context. Produce either a useful answer or the next required tool call.";
const FAILURE_MESSAGE =
	"The provider returned no output twice. Retry the turn or switch models; the previous work remains in the session.";

export function isEmptySuccessfulResponse(message: AssistantMessage): boolean {
	if (message.role !== "assistant" || message.stopReason !== "stop") return false;
	return !message.content.some(
		(block) => block.type === "toolCall" || (block.type === "text" && block.text.trim().length > 0),
	);
}

export default function emptyResponseGuard(pi: ExtensionAPI): void {
	let automaticRetries = 0;

	pi.on("turn_end", (event, ctx) => {
		if (event.message.role !== "assistant" || !isEmptySuccessfulResponse(event.message)) {
			automaticRetries = 0;
			return;
		}

		if (automaticRetries === 0) {
			automaticRetries = 1;
			if (ctx.hasUI) ctx.ui.notify("Provider returned no output; retrying once", "warning");
			pi.sendMessage(
				{
					customType: CUSTOM_TYPE,
					content: RETRY_PROMPT,
					display: false,
				},
				{ triggerTurn: true, deliverAs: "steer" },
			);
			return;
		}

		automaticRetries = 0;
		if (ctx.hasUI) ctx.ui.notify(FAILURE_MESSAGE, "error");
		pi.sendMessage(
			{
				customType: CUSTOM_TYPE,
				content: FAILURE_MESSAGE,
				display: true,
			},
			{ triggerTurn: false },
		);
	});
}
