import Link from "next/link";
export default function NotFound() {
  return (
    <main className="content-page">
      <h1>Record not found.</h1>
      <p>This application is not in the imported dataset.</p>
      <Link className="primary-link" href="/">
        Explore applications
      </Link>
    </main>
  );
}
