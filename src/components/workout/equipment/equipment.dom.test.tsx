import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Equipment, LoadType } from "@/contracts/enums";
import { EquipmentArt } from "./EquipmentArt";
import { LoadCaption } from "./LoadCaption";

const ex = (name: string, equipment: Equipment, loadType: LoadType, isUnilateral = false) => ({ name, equipment, loadType, isUnilateral });
const plates = (el: Element, side = "r") => [...el.querySelectorAll(`.eq-side--${side} .eq-plate`)].map((p) => p.getAttribute("data-weight"));

describe("EquipmentArt", () => {
  it("loads a bar from the total and the default bar", () => {
    const { container } = render(<EquipmentArt exercise={ex("EZ-Bar Curl", "EZ_BAR", "TOTAL")} unit="KG" load={30} />);
    const art = container.querySelector(".eq-art")!;
    expect(art).toHaveAttribute("data-kind", "bar");
    expect(art.querySelector("svg")).toHaveClass("eq-bar--ez");
    // EZ bar 10 kg: 10 kg a side
    expect(plates(art)).toEqual(["10"]);
    expect(plates(art, "l")).toEqual(["10"]);
  });

  it("fades a loaded kind with nothing logged, but never apparatus", () => {
    const { container: bell } = render(<EquipmentArt exercise={ex("Kettlebell Swing", "KETTLEBELL", "TOTAL")} unit="KG" load={null} />);
    expect(bell.querySelector(".eq-art")).toHaveClass("eq-art--ghost");
    const { container: mat } = render(<EquipmentArt exercise={ex("Plank", "BODYWEIGHT", "NONE")} unit="KG" load={null} />);
    expect(mat.querySelector(".eq-art")).toHaveAttribute("data-kind", "mat");
    expect(mat.querySelector(".eq-art")).not.toHaveClass("eq-art--ghost");
  });

  it("hangs added load on a dip belt, and draws the bar when nothing was added", () => {
    const pullups = ex("Weighted Pull Ups", "BODYWEIGHT", "BODYWEIGHT_PLUS");
    const { container: belt } = render(<EquipmentArt exercise={pullups} unit="KG" load={27.5} />);
    expect(belt.querySelector(".eq-art")).toHaveAttribute("data-kind", "belt");
    expect([...belt.querySelectorAll(".eq-plate--face")].map((p) => p.getAttribute("data-weight"))).toEqual(["25", "2.5"]);
    const { container: bar } = render(<EquipmentArt exercise={pullups} unit="KG" load={null} />);
    expect(bar.querySelector(".eq-art")).toHaveAttribute("data-kind", "pullup-bar");
  });

  it("is decoration unless given a label, and slides plates on only when asked", () => {
    const squat = ex("Barbell Squat", "BARBELL", "TOTAL");
    const { container } = render(<EquipmentArt exercise={squat} unit="KG" load={100} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".eq-art")).not.toHaveClass("eq-art--slide");
    const { getByRole } = render(<EquipmentArt exercise={squat} unit="KG" load={100} label="Bar loaded with 25, 15 kilograms per side" animate />);
    expect(getByRole("img", { name: "Bar loaded with 25, 15 kilograms per side" }).closest(".eq-art")).toHaveClass("eq-art--slide");
  });
});

describe("LoadCaption", () => {
  it("lists the plates per side and the bar", () => {
    const { container } = render(<LoadCaption exercise={ex("Barbell Squat", "BARBELL", "TOTAL")} unit="KG" load={110} />);
    expect(container).toHaveTextContent("Per side25+ 20· 20 kg bar");
  });
  it("says what a dumbbell pair or a bell is, and nothing without a load", () => {
    expect(render(<LoadCaption exercise={ex("Incline Dumbbell Press", "DUMBBELL", "PER_IMPLEMENT")} unit="KG" load={30} />).container).toHaveTextContent("Pair of 30 kg");
    expect(render(<LoadCaption exercise={ex("Goblet Squat", "KETTLEBELL", "TOTAL")} unit="LB" load={53} />).container).toHaveTextContent("53 lb bell");
    expect(render(<LoadCaption exercise={ex("Barbell Squat", "BARBELL", "TOTAL")} unit="KG" load={null} />).container).toBeEmptyDOMElement();
  });
});

describe("EquipmentArt with values it does not expect", () => {
  it("draws instead of throwing for an unknown unit, a weight that is not a number and an unknown equipment value", () => {
    const odd = { name: "Mystery lift", equipment: "LEGACY_THING" as never, loadType: "TOTAL" as const, isUnilateral: false };
    expect(() => render(<EquipmentArt exercise={odd} unit={"kg" as never} load={Number.NaN} />)).not.toThrow();
    const { container } = render(<EquipmentArt exercise={ex("Barbell Squat", "BARBELL", "TOTAL")} unit={"" as never} load={100} />);
    // an unknown unit is treated as kg: 100 kg is 25 + 15 a side on a 20 kg bar
    expect(plates(container.querySelector(".eq-art")!)).toEqual(["25", "15"]);
  });
});
