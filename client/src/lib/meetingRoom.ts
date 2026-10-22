export const MEETING_REACTIONS = [
  { key: "rocket", emoji: "🚀", label: "Rocket" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "applause", emoji: "👏", label: "Applause" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
  { key: "brilliant", emoji: "💡", label: "Brilliant" },
] as const;

export type ReactionKey = (typeof MEETING_REACTIONS)[number]["key"];

export function isReactionKey(value: unknown): value is ReactionKey {
  return (
    typeof value === "string" &&
    MEETING_REACTIONS.some((reaction) => reaction.key === value)
  );
}

export const SHARE_LAYOUT = {
  focus: "focus",
  split: "split",
} as const;

export type ShareLayout = (typeof SHARE_LAYOUT)[keyof typeof SHARE_LAYOUT];
