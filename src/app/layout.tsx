import type { Metadata } from "next"; import { AppShell } from "@/components/app-shell"; import "./globals.css";
export const metadata: Metadata={title:"맑은하늘클린 업무관리",description:"관리자 업무관리 시스템"}; export default function RootLayout({children}:LayoutProps<"/">){return <html lang="ko"><body><AppShell>{children}</AppShell></body></html>}
