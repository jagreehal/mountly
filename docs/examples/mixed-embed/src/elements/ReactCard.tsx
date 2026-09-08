export interface ReactCardProps {
  balance: number;
  currency: string;
}

export default function ReactCard({ balance, currency }: ReactCardProps) {
  return (
    <p data-testid="react">
      react {currency} {balance}
    </p>
  );
}
