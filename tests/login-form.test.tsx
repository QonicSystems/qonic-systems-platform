import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

// The password field is queried by its exact label. A loose /password/i also
// matches the reveal toggle's accessible name ("Show password"), which is a
// second labelled element in the same form.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(""),
}));

describe("LoginForm", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("posts the credentials and follows the server's redirect", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Signed in.", redirectTo: "/dashboard" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/work email/i), "hr@qonicsystems.com");
    await userEvent.type(screen.getByLabelText("Password"), "Demo-Passw0rd");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(options.body)).toMatchObject({ email: "hr@qonicsystems.com", password: "Demo-Passw0rd" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the server's message on a failed sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Email or password is incorrect." }) }));

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/work email/i), "hr@qonicsystems.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces per-field validation errors and links them for screen readers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Please correct the highlighted fields.", errors: { email: "Please enter a valid email address." } }),
    }));

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/work email/i), "bad");
    await userEvent.type(screen.getByLabelText("Password"), "something");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const field = await screen.findByLabelText(/work email/i);
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
  });

  it("reveals and re-hides the password without submitting the form", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginForm />);
    const field = screen.getByLabelText("Password");
    await userEvent.type(field, "Demo-Passw0rd");
    expect(field).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    // The value must survive the swap — re-rendering a different input type has
    // to keep what was typed, or revealing would wipe the field.
    expect(field).toHaveValue("Demo-Passw0rd");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");

    // The toggle sits inside the form, so a missing type="button" would submit it.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a network failure instead of hanging on 'Signing in…'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/work email/i), "hr@qonicsystems.com");
    await userEvent.type(screen.getByLabelText("Password"), "Demo-Passw0rd");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to reach the server/i);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });
});
