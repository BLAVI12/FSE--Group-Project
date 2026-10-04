type GoogleAuthButtonProps = {
  disabled: boolean;
  loading: boolean;
  mode: "login" | "register";
  onClick: () => void;
};

export function GoogleAuthButton({
  disabled,
  loading,
  mode,
  onClick,
}: GoogleAuthButtonProps) {
  const label =
    mode === "register" ? "Sign up with Google" : "Continue with Google";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group grid h-12 w-full grid-cols-[24px_1fr_24px] items-center gap-2.5 rounded-lg border border-[#8e918f] bg-[#131314] px-3 text-sm font-medium text-[#e3e3e3] shadow-sm transition hover:bg-[#202124] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4f8] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-white">
        <GoogleLogo />
      </span>
      <span>{loading ? "Connecting to Google..." : label}</span>
      <span aria-hidden="true" />
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px]"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.707V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.039l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
