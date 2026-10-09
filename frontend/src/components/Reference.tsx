import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, LoaderCircle, Plus, Search } from "lucide-react";
import { api, errorMessage } from "../api";
import type { OptionEntry, OptionGroup } from "../types";
import { Empty, Heading } from "./UI";

export function Reference({ add }: { add: (option: OptionEntry) => void }) {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.toLowerCase());
  const query = useQuery({
    queryKey: ["options"],
    queryFn: () => api<{ version: string; groups: OptionGroup[] }>("/options"),
    staleTime: Infinity,
  });
  const groups =
    query.data?.groups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) =>
          `${o.flags.join(" ")} ${o.help} ${g.name}`
            .toLowerCase()
            .includes(deferred),
        ),
      }))
      .filter((g) => g.options.length) || [];
  return (
    <>
      <Heading
        eyebrow="ALL THAT POWER, WITHIN REACH"
        title="The finer controls"
        description="Search the options in your installed yt-dlp. Add them to custom arguments."
      />
      <div className="reference-notice">
        <BookOpen />
        <p>
          Most download, network, subtitle, extractor, and postprocessing
          options work here. Options marked <strong>App managed</strong> control
          server files, command execution, or the queue protocol. Use the app’s
          fields for their supported equivalents.
        </p>
      </div>
      <label className="search-field reference-search">
        <Search />
        <input
          type="search"
          placeholder="Search options, e.g. referer, SponsorBlock, chapters…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search yt-dlp options"
        />
      </label>
      {query.isPending ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Reading your installed yt-dlp options…
        </div>
      ) : query.error ? (
        <p className="field-error" role="alert">
          {errorMessage(query.error)}
        </p>
      ) : groups.length ? (
        groups.map((group) => (
          <section className="option-group" key={group.name}>
            <h2>
              {group.name.replace(/:$/, "")}
              <span className="count-label">{group.options.length}</span>
            </h2>
            <div className="panel option-rows">
              {group.options.map((option) => (
                <div className="option-row" key={option.flags.join(",")}>
                  <div>
                    <div className="option-flags">
                      {option.flags.map((flag) => (
                        <code key={flag}>{flag}</code>
                      ))}
                      {option.takes_value && (
                        <span className="metavar">
                          {option.metavar || "VALUE"}
                        </span>
                      )}
                    </div>
                    <p>{option.help.replace(/%default/g, "default")}</p>
                  </div>
                  {option.managed ? (
                    <span className="managed-badge">App managed</span>
                  ) : (
                    <button
                      className="icon-button add-option"
                      title="Add to custom arguments"
                      aria-label={`Add ${option.flags.at(-1)}`}
                      onClick={() => add(option)}
                    >
                      <Plus />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <Empty icon={Search} title="No matching options.">
          Try an option name or a word from its description.
        </Empty>
      )}
    </>
  );
}
