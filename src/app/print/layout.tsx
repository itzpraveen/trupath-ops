export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">{children}</div>;
}
