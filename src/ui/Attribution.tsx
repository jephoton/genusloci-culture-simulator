const link = "underline hover:text-zinc-300";

/** Map credit (ODbL requires it), plus Qloo's when the city runs on Qloo taste data. */
export function Attribution({ qloo = false }: { qloo?: boolean }) {
  return (
    <p className="pointer-events-auto absolute bottom-1 right-2 text-[10px] text-zinc-500">
      Map data ©{" "}
      <a className={link} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap contributors
      </a>
      {qloo && (
        <>
          {" · "}Taste data:{" "}
          <a className={link} href="https://www.qloo.com" target="_blank" rel="noreferrer">
            Qloo
          </a>
        </>
      )}
    </p>
  );
}
