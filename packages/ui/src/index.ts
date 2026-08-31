export const coreTokens = {
  color: {
    navy: "#001B34",
    ocean: "#0B648A",
    gold: "#F2C94C",
    ivory: "#F7F7F6",
    cloud: "#E6ECF2",
    ink: "#12263F",
    muted: "#64778B",
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { control: 12, card: 16, story: 22, pill: 999 },
  type: { body: 16, supporting: 14, meta: 12, h3: 19, h2: 23, h1: 30, display: 36 },
  touchTarget: 48,
  motion: { quick: 180, standard: 240, story: 320 },
} as const;

export const ccPhuketTheme = {
  primary: "#102A43",
  accent: "#C9A45C",
  canvas: "#FCF9F3",
  surfaceWarm: "#EFE6D7",
  ink: "#152535",
  divider: "#EDF1F3",
} as const;

export type GuestTheme = {
  primary: string;
  accent: string;
  canvas: string;
  surfaceWarm: string;
  ink: string;
  divider: string;
};

export const semanticState = {
  success: { color: "#267A4A", icon: "check-circle" },
  pending: { color: "#9A6A13", icon: "clock" },
  inProgress: { color: "#0B648A", icon: "activity" },
  attention: { color: "#B45309", icon: "alert-circle" },
  critical: { color: "#B42318", icon: "user-round" },
  neutral: { color: "#64778B", icon: "info" },
} as const;
