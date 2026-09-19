import PageHeader from '../../components/PageHeader';

export default function VideoWallPage({ standalone = false }: { standalone?: boolean }) {
  void standalone;
  return (
    <div className="space-y-6">
      <PageHeader title="Videodevor" subtitle="" />
    </div>
  );
}
