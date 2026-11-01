# ytd

Turn any YouTube channel into clear notes with sources and no repeated points.

ytd is a local terminal tool. Give it a channel, playlist, video or Short and it reads the
captions, description and pinned comment, pulls out the useful ideas, and writes them into your
own Markdown notes repository — each point next to the video it came from. It runs a coding-agent
CLI you already have (Claude, Codex, Pi or OpenCode) with a model you pick, so it needs no API keys
of its own and sends nothing to a service of its own.

## What you can do

- Turn a whole channel, a playlist, a single video or a Short into notes.
- Keep only new ideas: points already in your notes are skipped.
- Cite every point with its source video.
- See what was rejected and why, plus a halal review section for every batch.
- Stop and resume: re-run the same command and finished work is reused.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer.
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on your `PATH`.
- Node.js or Deno, which `yt-dlp` uses to read YouTube.
- One coding-agent CLI installed and already signed in: Claude, Codex, Pi or OpenCode.
- A Git notes repository at `~/Desktop/mind-palace` that has a `scripts/mind-palace-sync`
  script supporting `--require-unchanged-base`.
- FFmpeg on your `PATH`, only if you use `--transcribe`.

## Install

```sh
git clone https://github.com/Dropout-Studio-Co/ytd.git
cd ytd
bun install --frozen-lockfile
bun link
```

## Usage

```sh
ytd                                  # asks for a URL, then the agent and model
ytd 'https://www.youtube.com/@creator'
ytd 'https://www.youtube.com/playlist?list=PLxxxxxxxx'
ytd 'https://youtu.be/VIDEO_ID'
```

Save your choice so later runs skip the picker, or add your own wrapper script as an agent:

```sh
ytd settings                       # remember agent, model and effort
ytd agents add                     # register a trusted command as an agent
ytd --help
```

Skip the picker with explicit arguments:

```sh
ytd 'https://youtu.be/VIDEO_ID' --agent claude --model opus --effort high
ytd 'https://youtu.be/VIDEO_ID' --agent codex --model YOUR_MODEL_ID
```

Changing agent requires `--model`. For videos with no usable captions, opt in to local
transcription — nothing is downloaded, so both files must already exist:

```sh
ytd 'https://youtu.be/VIDEO_ID' --transcribe \
  --whisper-command /path/to/whisper-cli --whisper-model /path/to/model.bin
```

Optional limits and reports: `--fetch-concurrency N`, `--extract-concurrency N`,
`--fetch-pacing-ms N`, `--max-attempts N`, `--context-tokens N`, `--timeout-ms N`, `--perf`,
`--verbose`.

## Configuration

ytd has no API keys of its own; model credentials stay in your agent CLI.

- `YTD_UI=plain` or `YTD_UI=styled` forces plain or styled output.
- `NO_COLOR=1` turns colour off. Plain output is automatic when output is not a terminal, in CI,
  or with `TERM=dumb`.
- `YTD_WHISPER_COMMAND` and `YTD_WHISPER_MODEL` replace the transcription flags.
- Saved settings are in `~/.ytd/config.json`; run state, video cache and the SQLite library are in
  `~/.ytd/`.

Keep secrets out of `ytd settings` and custom-agent arguments: that file is plain JSON.

## Troubleshooting

- **`yt-dlp` not found** — install it and make sure it is on `PATH`; the run stops before fetching.
- **Model unavailable or changed** — sign in again with your agent (for OpenCode,
  `opencode auth login`) and re-run with `--model` naming a model your account can use. ytd never
  substitutes another model.
- **Notes not published** — publication needs the palace repository above, a clean
  `mind-palace-sync` base and the `--require-unchanged-base` it supports. Progress is kept; fix the
  palace and re-run the same command.

## License

MIT — see [LICENSE](./LICENSE).
