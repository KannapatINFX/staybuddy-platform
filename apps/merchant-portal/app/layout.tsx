export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: 40 }}>{children}</body>
    </html>
  );
}
