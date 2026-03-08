import { useEffect, useState } from "react";

export default function useGreeting(): string {
  const [greeting, setGreeting] = useState("Hi");

  useEffect(() => {
    const hour = new Date().getHours();

    let greet = "Hi";
    if (hour >= 5 && hour < 12) {
      greet = "Good Morning";
    } else if (hour >= 12 && hour < 17) {
      greet = "Good Afternoon";
    } else if (hour >= 17 && hour < 22) {
      greet = "Good Evening";
    } else {
      greet = "Hello";
    }

    setGreeting(greet);
  }, []);

  return greeting;
}
