import { signOut } from "@/app/auth/actions";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({
  className = "",
}: LogoutButtonProps) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={className}
      >
        Log out
      </button>
    </form>
  );
}