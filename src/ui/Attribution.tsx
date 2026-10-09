export function Attribution() {
  return (
    <p className="pointer-events-auto absolute bottom-1 right-2 text-[10px] text-zinc-500">
      Map data ©{" "}
      <a className="underline hover:text-zinc-300" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap contributors
      </a>
    </p>
  );
}
