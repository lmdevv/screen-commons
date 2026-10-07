import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createThemeScript, THEME_STORAGE_KEY } from "../lib/theme";
import { ThemeProvider, ThemeToggle, useTheme } from "./theme";

function Probe() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <span data-testid="probe">
      {theme}/{resolvedTheme}
    </span>
  );
}

describe("ThemeProvider", () => {
  it("restores the stored theme and applies the class to <html>", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("dark/dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("resolves system to the OS preference and persists explicit choices", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
        <ThemeToggle />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("system/light"));
    expect(document.documentElement.classList.contains("light")).toBe(true);

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByTestId("probe").textContent).toBe("dark/dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("throws a helpful error outside the provider", () => {
    const original = console.error;
    console.error = () => undefined;
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    console.error = original;
  });
});

describe("themeScript", () => {
  it("applies the stored theme before React runs", () => {
    localStorage.setItem("custom-key", "dark");
    act(() => {
      new Function(createThemeScript("custom-key"))();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("falls back to the OS preference for unknown values", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    new Function(createThemeScript())();
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
