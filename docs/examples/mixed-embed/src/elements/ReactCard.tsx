import styles from "./ReactCard.module.css";

export interface ReactCardProps {
  balance: number;
  currency: string;
}

export default function ReactCard({ balance, currency }: ReactCardProps) {
  return (
    <p className={styles.card} data-testid="react">
      react {currency} {balance}
    </p>
  );
}
