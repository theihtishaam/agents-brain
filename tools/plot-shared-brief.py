import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator


def plot(receipt_path, output_path):
    result = json.loads(receipt_path.read_text(encoding="utf-8-sig"))
    evidence = [result["isolated"], result["shared"]]
    possible = evidence[0]["possibleFactSlots"]
    if possible <= 0 or any(row["possibleFactSlots"] != possible for row in evidence):
        raise ValueError("Both conditions must use the same positive number of fact slots")

    background = "#0b1322"
    ink = "#f2f6fc"
    muted = "#afbdd1"
    grid = "#293b53"
    violet = "#a6a1ff"
    cyan = "#67e0d0"
    fig = plt.figure(figsize=(12, 5.65), dpi=130, facecolor=background)
    fig.text(0.05, 0.88, "One question, two memory setups", color=ink, fontsize=27, fontweight="bold")
    fig.text(0.051, 0.804, result["query"], color=muted, fontsize=13)
    fig.text(0.276, 0.693, "Cited facts across all replies", color=ink, fontsize=12, fontweight="bold")
    fig.text(0.878, 0.693, "Successful tool receipts", color=ink, fontsize=12, fontweight="bold", ha="center")

    axes = fig.add_axes((0.276, 0.29, 0.486, 0.36), facecolor=background)
    axes.set(xlim=(0, possible), ylim=(-0.55, 1.55), yticks=[])
    axes.xaxis.set_major_locator(MaxNLocator(4, integer=True))
    axes.tick_params(axis="x", colors=muted, length=0, labelsize=11, pad=10)
    axes.grid(axis="x", color=grid, linewidth=0.75)
    axes.set_axisbelow(True)
    for spine in axes.spines.values():
        spine.set_visible(False)

    for index, (row, label, hint, color) in enumerate(zip(evidence, ["Isolated stores", "Shared store"],
            ["One fact per client", "Four facts available to every client"], [violet, cyan])):
        y = 1 - index
        fig_y = 0.29 + 0.36 * (y + 0.55) / 2.1
        fig.text(0.051, fig_y + 0.009, label, color=ink, fontsize=16, fontweight="bold", va="center")
        fig.text(0.051, fig_y - 0.034, hint, color=muted, fontsize=9.5, va="center")
        axes.barh(y, possible, height=0.43, color="#19283c", zorder=2)
        facts = row["citedFactSlots"]
        axes.barh(y, facts, height=0.43, color=color, zorder=3)
        axes.text(min(facts, possible) - possible * 0.015, y, f"{facts} / {possible}", ha="right", va="center",
                  fontsize=12, fontweight="bold", color=background, zorder=4)
        fig.text(0.878, fig_y, f'{row["successfulMeasuredPairs"]} / {row["requests"]}', color=ink,
                 fontsize=17, fontweight="bold", ha="center", va="center")

    fig.text(0.051, 0.16, "Four facts × four scripted requests = 16 possible citations in each setup.", color=ink, fontsize=12)
    fig.text(0.051, 0.105, "A counted citation has the expected text, source reference and memory ID. Each receipt pairs a request and a successful result.",
             color=muted, fontsize=10.5)
    fig.savefig(output_path, facecolor=background)
    plt.close(fig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Plot the Atlas shared-briefing fixture from its measured receipts.")
    parser.add_argument("receipt_path", type=Path)
    parser.add_argument("output_path", type=Path)
    args = parser.parse_args()
    plot(args.receipt_path, args.output_path)
